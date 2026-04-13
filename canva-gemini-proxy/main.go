package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
)

type MapRequest struct {
	UserContent string        `json:"user_content"`
	SlideSchema map[string]interface{} `json:"slide_schema"`
}

// Structs for the Ollama API
type OllamaRequest struct {
	Model  string `json:"model"`
	Prompt string `json:"prompt"`
	Stream bool   `json:"stream"`
	Format string `json:"format"` // This forces JSON output!
	Options map[string]interface{} `json:"options"`
}

type OllamaResponse struct {
	Response string `json:"response"`
}

func main() {
	http.HandleFunc("/api/map-content", handleMapContent)
	port := "8081"
	fmt.Printf("Starting secure Go proxy server on :%s\n", port)
	log.Fatal(http.ListenAndServe(":"+port, nil))
}

func handleMapContent(w http.ResponseWriter, r *http.Request) {
	// 1. Handle CORS
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}

	// 2. Parse the request from Canva
	var req MapRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}
	schemaBytes, _ := json.Marshal(req.SlideSchema)

	// 3. Craft the Prompt
prompt := fmt.Sprintf(`You are an expert presentation layout engine. I will give you a document and a 'Deck Roster' containing the available slides and the 'ideal_length' for each text slot.

Your job is to break the document down and distribute it across the slides. 

CRITICAL MAPPING HIERARCHY:
1. THE LABEL EXCEPTION (Highest Priority): If a node in the Roster contains a single digit (e.g., "1"), a number, or a single character, it is a decorative label. You are FORBIDDEN from modifying it. Exclude it from the JSON entirely.
2. THE TITLE MANDATE: If you use a slide, you MUST fill its 'Large Title' or 'Header' node. 'Large Title' or 'Header' nodes MUST be extreme summaries. MAXIMUM 5-6 WORDS. 
   - BAD TITLE: "We saw a massive increase in our Q3 revenue."
   - GOOD TITLE: "Q3 Revenue Growth"
   - BAD TITLE: "Here is a breakdown of our current marketing strategy."
   - GOOD TITLE: "Marketing Strategy Breakdown"
3. BODY COMPLETENESS: After filling the Title, attempt to fill the remaining 'Body Text' slots on that slide before moving to a new one. EXCEPTION: Do not fill slots protected by Rule 1.
4. STRICT LENGTHS: You must summarize text to fit the 'ideal_length'. Do not cram paragraphs into 'Short' slots. Conciseness is mandatory to prevent microscopic fonts.
5. DECK EXHAUSTION: Stop once all User Content is mapped. Use up to 10 slides if necessary to keep text readable.
6. FORMAT: Output ONLY a single, flat JSON object mapping node IDs to text (e.g., {"node_1": "Brief Title", "node_3": "Short body text."}). No nesting.
User Content: %s

Deck Roster: %s`, req.UserContent, string(schemaBytes))

	// 4. Build the payload for Ollama
	ollamaReq := OllamaRequest{
		Model:  "gemma4:e2b", // Make sure you ran 'ollama run llama3.2' first!
		Prompt: prompt,
		Stream: false,
		Format: "json", // Forces structured output
		Options: map[string]interface{}{
			// "temperature": 0.1,    
			
			// Choose your fighter:
			"num_ctx": 16384,    // 32K (Safe for 16GB RAM)
			// "num_ctx": 65536,    // 64K (Pushing it)
			// "num_ctx":    131072,   // 128K (The absolute maximum!)
		},
	}
	reqBody, _ := json.Marshal(ollamaReq)

	// 5. Send to Windows Ollama (REPLACE THE IP ADDRESS!)
	ollamaURL := "http://172.21.64.1:11434/api/generate"
	
	resp, err := http.Post(ollamaURL, "application/json", bytes.NewBuffer(reqBody))
	if err != nil {
		log.Printf("❌ Failed to reach Ollama: %v", err)
		http.Error(w, "Ollama connection failed", http.StatusInternalServerError)
		return
	}
	defer resp.Body.Close()

	// 6. Decode Ollama's response
	var ollamaResp OllamaResponse
	if err := json.NewDecoder(resp.Body).Decode(&ollamaResp); err != nil {
		log.Printf("❌ Failed to decode Ollama response: %v", err)
		http.Error(w, "Failed to parse Ollama JSON", http.StatusInternalServerError)
		return
	}

	// 7. Send the mapped JSON back to Canva
	w.Header().Set("Content-Type", "application/json")
	w.Write([]byte(ollamaResp.Response))
}