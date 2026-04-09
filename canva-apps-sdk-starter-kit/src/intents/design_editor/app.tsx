import { Button, Rows, Text, MultilineInput } from "@canva/app-ui-kit";
import { useState } from "react";
import * as styles from "styles/components.css"; 
import { extractSlideSchema, applyMappingToCanvas } from "./utils/slideExtractor";

export const App = () => {
  const [isExtracting, setIsExtracting] = useState(false);
  const [userContent, setUserContent] = useState("");
  
  // New state to replace the blocked alert() calls
  const [statusMsg, setStatusMsg] = useState("");

  const handleAutomateClick = async () => {
    if (!userContent.trim()) {
      setStatusMsg("⚠️ Please enter some content first!");
      return;
    }

    setIsExtracting(true);
    setStatusMsg("🔍 Analyzing canvas layout...");
    
    try {
      const schema = await extractSlideSchema();
      const safeSchemaForBackend = schema.map(({ canvaRef, ...rest }) => rest);

      setStatusMsg("🧠 Generating AI mapping...");
      const response = await fetch("http://localhost:8081/api/map-content", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_content: userContent,
          slide_schema: safeSchemaForBackend,
        }),
      });

      if (!response.ok) throw new Error(`Proxy error: ${response.statusText}`);

      const mappedContent = await response.json();
      
      setStatusMsg("✍️ Injecting content into slide...");
      await applyMappingToCanvas(mappedContent);
      
      setStatusMsg("🎉 Slide successfully automated!");
      
      // Clear the success message after 4 seconds
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
          Paste your presentation content below, and we will automatically format it to fit the current slide!
        </Text>
        
        <MultilineInput
          value={userContent}
          onChange={(value) => setUserContent(value)}
          placeholder="e.g. Our Q3 Revenue was fantastic. We hit $2.4M in sales, which is a 15% increase from last quarter."
          minRows={5}
        />
        
        {/* Dynamic Status Feedback */}
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
          {isExtracting ? "Automating Slide..." : "Populate Slide"}
        </Button>
      </Rows>
    </div>
  );
};