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

RULES:
1. You do not have to use every slide, and you do not have to use every node on a slide. Leave unused nodes out of the JSON.
2. Match the semantic weight of the text to the 'role' of the node (e.g., headers go into 'Large Title' slots).
3. Use the 'ideal_length' as a strict guideline to ensure the text physically fits in the box.
4. Output ONLY a single, flat JSON object where the keys are the node IDs (e.g., "node_1", "node_5") and the values are the generated text. Do not nest the JSON under page IDs.

User Content: %s

Deck Roster: %s`, req.UserContent, string(schemaBytes))

	// 4. Build the payload for Ollama
	ollamaReq := OllamaRequest{
		Model:  "llama3.2", // Make sure you ran 'ollama run llama3.2' first!
		Prompt: prompt,
		Stream: false,
		Format: "json", // Forces structured output
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