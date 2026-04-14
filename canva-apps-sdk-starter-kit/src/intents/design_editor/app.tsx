import { Button, Rows, Text, MultilineInput } from "@canva/app-ui-kit";
import { useState } from "react";
import * as styles from "styles/components.css"; 
import { extractDeckSchema, applyMappingToCanvas } from "./utils/slideExtractor";

export const App = () => {
  const [isExtracting, setIsExtracting] = useState(false);
  const [userContent, setUserContent] = useState("");
  const [statusMsg, setStatusMsg] = useState("");

  const handleAutomateClick = async () => {
    if (!userContent.trim()) {
      setStatusMsg("⚠️ Please enter some content first!");
      return;
    }

    setIsExtracting(true);
    setStatusMsg("🔍 Analyzing full deck layout...");
    
    try {
      // 1. Extract the Multi-Slide Deck Roster
      const deckSchema = await extractDeckSchema();
      console.log("✅ Deck Roster Extracted:", deckSchema);

      setStatusMsg("🧠 Generating AI mapping for full deck...");

      // 2. Exponential Backoff Retry Loop
      let response;
      let retries = 3;
      let delay = 1000; // Start with a 1 second delay

      for (let i = 0; i < retries; i++) {
        response = await fetch("http://localhost:8081/api/map-content", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            user_content: userContent,
            slide_schema: deckSchema, // <-- Sending the multi-slide layout!
          }),
        });

        if (response.ok) break; // Success! Exit the retry loop.

        console.warn(`Attempt ${i + 1} failed. Retrying in ${delay}ms...`);
        setStatusMsg(`⚠️ API busy. Retrying... (${i + 1}/${retries})`);
        
        await new Promise(resolve => setTimeout(resolve, delay));
        delay *= 2; 
      }

      if (!response || !response.ok) {
        throw new Error(`Proxy error after ${retries} attempts.`);
      }

      const mappedContent = await response.json();
      console.log("🧠 Ollama Mapping Result:", mappedContent);
      
      setStatusMsg("✍️ Injecting content into slides...");
      
      // 3. Write back to the canvas
      await applyMappingToCanvas(mappedContent);
      
      setStatusMsg("🎉 Deck successfully automated!");
      setTimeout(() => setStatusMsg(""), 4000);

    } catch (error) {
      console.error("❌ Process failed:", error);
      setStatusMsg("❌ Error: Check the console for details.");
    } finally {
      setIsExtracting(false);
    }
  };

  return (
    <div className={styles.scrollContainer || ""}>
      <Rows spacing="3u">
        <Text>
          Paste your presentation notes below, and we will automatically format them across the entire deck!
        </Text>
        
        <MultilineInput
          value={userContent}
          onChange={(value) => setUserContent(value)}
          placeholder="e.g. Our Q3 Revenue was fantastic. We hit $2.4M in sales..."
          minRows={5}
        />
        
        {statusMsg && (
          <Text tone={statusMsg.includes("❌") ? "critical" : "positive"}>
            {statusMsg}
          </Text>
        )}
        
        <Button
          variant="primary"
          onClick={handleAutomateClick}
          disabled={isExtracting || !userContent.trim()}
          stretch
        >
          {isExtracting ? "Automating Deck..." : "Populate Deck"}
        </Button>
      </Rows>
    </div>
  );
};