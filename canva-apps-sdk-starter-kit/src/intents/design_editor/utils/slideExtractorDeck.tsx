import { openDesign } from "@canva/design";

// Temporary interface for our extracted schema
interface SlideElement {
  id: string;
  type: "TEXT" | "IMAGE_SLOT";
  role_guess?: "Title" | "Subtitle" | "Body" | "Visual";
  top: number;
  left: number;
  width: number;
  height: number;
  current_text?: string;
  fontSizeEstimate?: number;
  canvaRef: any; // Keep a reference to write back later
}

export async function extractDeckSchema() {
  return new Promise((resolve) => {
    // 1. The correct SDK context for multi-page extraction
    openDesign({ type: "all_pages" }, async (session) => {
      const deckRoster: Record<string, any> = {};
      let globalIdCounter = 1;

      // 2. Get the catalog of all pages in the design
      const pages = session.pageRefs.toArray();

      // 3. Loop through and open each page individually
      for (let index = 0; index < pages.length; index++) {
        const pageRef = pages[index];
        const pageId = `page_${index + 1}`;

        await session.helpers.openPage(pageRef, async (pageSession) => {
          // Ensure it's a presentation slide
          if (pageSession.page.type !== "absolute") return;
          
          const textSlots: any[] = [];
          let imageSlotsCount = 0;

          function traverse(element: any, offsetX = 0, offsetY = 0) {
            const absoluteTop = offsetY + element.top;
            const absoluteLeft = offsetX + element.left;

            if (element.type === "group") {
              element.contents.forEach((child: any) => traverse(child, absoluteLeft, absoluteTop));
            } else if (element.type === "text") {
              const regions = element.text.readTextRegions() || [];
              const fontSize = regions[0]?.formatting?.fontSize || 16;
              
              let roleGuess = "Body Text";
              if (fontSize >= 45) roleGuess = "Large Title";
              else if (fontSize >= 24) roleGuess = "Subtitle / Header";

              const boxWidth = element.width;
              const boxHeight = element.height || (fontSize * 1.5);
              const strictCapacity = Math.floor((boxWidth / (fontSize * 0.6)) * (boxHeight / (fontSize * 1.2)));

              let idealLength = "";
              if (strictCapacity <= 40) idealLength = "Very Short (1-5 words)";
              else if (strictCapacity <= 120) idealLength = "Short (10-20 words)";
              else if (strictCapacity <= 300) idealLength = "Medium (30-50 words)";
              else idealLength = "Long (50+ words)";

              textSlots.push({
                id: `node_${globalIdCounter++}`,
                role: roleGuess,
                ideal_length: idealLength,
                _top: absoluteTop, 
                _left: absoluteLeft
              });
            } else if (["image", "shape", "rect"].includes(element.type)) {
              imageSlotsCount++;
              globalIdCounter++; 
            }
          }

          pageSession.page.elements.forEach((el: any) => traverse(el));

          textSlots.sort((a, b) => {
            if (Math.abs(a._top - b._top) < 20) return a._left - b._left;
            return a._top - b._top;
          });

          const cleanTextSlots = textSlots.map(({ _top, _left, ...rest }) => rest);

          deckRoster[pageId] = {
            text_slots: cleanTextSlots,
            image_slots: imageSlotsCount
          };
        });
      }

      resolve({ deck_roster: deckRoster });
    });
  });
}

export async function extractSlideSchema() {
  let finalSchema: SlideElement[] = [];

  await openDesign({ type: "current_page" }, async (session) => {
    // 1. Ensure we are on a Presentation page
    if (session.page.type !== "absolute") {
      console.error("This app only works on absolute formats like Presentations.");
      return;
    }

    const flattenedElements: SlideElement[] = [];
    let idCounter = 1;

    // 2. The Recursive Crawler Function
    function traverse(element: any, offsetX = 0, offsetY = 0) {
      // Calculate absolute positions (vital if inside a group!)
      const absoluteTop = offsetY + element.top;
      const absoluteLeft = offsetX + element.left;

      if (element.type === "group") {
        // Dive into the group's contents list
        element.contents.forEach((child: any) => 
          traverse(child, absoluteLeft, absoluteTop)
        );
      } 
      else if (element.type === "text") {
        // Extract text and highest font size from regions
        const regions = element.text.readTextRegions();
        const fullText = regions.map((r: any) => r.text).join(" ");
        
        // Find the largest font size in this text box for heuristics
        let maxFontSize = 0;
        regions.forEach((r: any) => {
          if (r.formatting?.fontSize > maxFontSize) maxFontSize = r.formatting.fontSize;
        });

        flattenedElements.push({
          id: `node_${idCounter++}`,
          type: "TEXT",
          top: absoluteTop,
          left: absoluteLeft,
          width: element.width,
          height: element.height || 0, // Text boxes sometimes auto-calculate height
          current_text: fullText,
          fontSizeEstimate: maxFontSize,
          canvaRef: element 
        });
      } 
      else if (["image", "shape", "rect"].includes(element.type)) {
        flattenedElements.push({
          id: `node_${idCounter++}`,
          type: "IMAGE_SLOT",
          top: absoluteTop,
          left: absoluteLeft,
          width: element.width,
          height: element.height,
          role_guess: "Visual",
          canvaRef: element
        });
      }
    }

    // 3. Initiate traversal on all top-level elements
    session.page.elements.forEach((el: any) => traverse(el));

    // 4. The Heuristic Engine (Categorize the text)
    const textNodes = flattenedElements.filter(el => el.type === "TEXT");
    
    // Sort text nodes by font size (descending)
    textNodes.sort((a, b) => (b.fontSizeEstimate || 0) - (a.fontSizeEstimate || 0));

    // Assign roles based on size and Y-position
    textNodes.forEach((node, index) => {
      if (index === 0 && node.top < (session.page.dimensions!.height * 0.4)) {
        node.role_guess = "Title";
      } else if (index === 1 && node.top < (session.page.dimensions!.height * 0.5)) {
        node.role_guess = "Subtitle";
      } else {
        node.role_guess = "Body";
      }
    });

    // 5. Finalize the spatial schema (sort top-to-bottom, left-to-right for the LLM)
    finalSchema = flattenedElements.sort((a, b) => {
      // If elements are on roughly the same horizontal line (within 20px), sort left-to-right
      if (Math.abs(a.top - b.top) < 20) {
        return a.left - b.left;
      }
      // Otherwise sort top-to-bottom
      return a.top - b.top;
    });

    const safeSchema = finalSchema.map(({ canvaRef, ...rest }) => rest);
    console.log("Ready for Gemini!", JSON.stringify(safeSchema, null, 2));
    
    // Note: Do NOT call session.sync() here. We are only reading, not writing yet.
  });

  return finalSchema;
}

export async function applyMappingToCanvas(mappedContent: Record<string, string>) {
  // 4. Update the write-back function to also use all_pages
  await openDesign({ type: "all_pages" }, async (session) => {
    let globalIdCounter = 1;
    const pages = session.pageRefs.toArray();

    // Loop through and write to each page
    for (let index = 0; index < pages.length; index++) {
      const pageRef = pages[index];

      await session.helpers.openPage(pageRef, async (pageSession) => {
        if (pageSession.page.type !== "absolute") return;

        const flattenedElements: any[] = [];

        function traverse(element: any, offsetX = 0, offsetY = 0) {
          const absoluteTop = offsetY + element.top;
          const absoluteLeft = offsetX + element.left;

          if (element.type === "group") {
            element.contents.forEach((child: any) => traverse(child, absoluteLeft, absoluteTop));
          } else if (element.type === "text") {
            flattenedElements.push({
              id: `node_${globalIdCounter++}`,
              type: "TEXT",
              top: absoluteTop,
              left: absoluteLeft,
              canvaRef: element
            });
          } else if (["image", "shape", "rect"].includes(element.type)) {
            flattenedElements.push({
              id: `node_${globalIdCounter++}`,
              type: "IMAGE_SLOT",
              top: absoluteTop,
              left: absoluteLeft,
              canvaRef: element 
            });
          }
        }

        pageSession.page.elements.forEach((el: any) => traverse(el));

        flattenedElements.sort((a, b) => {
          if (Math.abs(a.top - b.top) < 20) return a.left - b.left;
          return a.top - b.top;
        });

        flattenedElements.forEach((node) => {
          if (node.type === "TEXT" && mappedContent[node.id]) {
            const newText = mappedContent[node.id];
            
            try {
              const plainText = node.canvaRef.text.readPlaintext();
              const totalLength = plainText.length;

              const regions = node.canvaRef.text.readTextRegions() || [];
              const originalFontSize = regions[0]?.formatting?.fontSize || 16;

              const boxWidth = node.canvaRef.width;
              const boxHeight = node.canvaRef.height || (originalFontSize * 1.5);
              
              const charsPerLine = boxWidth / (originalFontSize * 0.6);
              const numLines = boxHeight / (originalFontSize * 1.2);
              const strictCapacity = Math.floor(charsPerLine * numLines);

              node.canvaRef.text.replaceText({ index: 0, length: totalLength }, newText);

              if (newText.length > strictCapacity) {
                  const scaleFactor = (boxWidth * boxHeight) / (newText.length * 0.72);
                  const calculatedSize = Math.floor(Math.sqrt(scaleFactor));
                  const bufferedSize = Math.floor(calculatedSize * 0.9);
                  const finalFontSize = Math.max(10, bufferedSize);

                  node.canvaRef.text.formatParagraph(
                      { index: 0, length: newText.length }, 
                      { fontSize: finalFontSize }
                  );
              }
            } catch (err) {
              console.error(`❌ Failed to update ${node.id}:`, err);
            }
          }
        });

      });
    }
    await session.sync();
  });
}