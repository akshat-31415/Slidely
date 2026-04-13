package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"

	"google.golang.org/genai"
)

// The payload we expect from the Canva frontend
type MapRequest struct {
	UserContent string        `json:"user_content"`
	SlideSchema []interface{} `json:"slide_schema"`
}

func main() {
	// Ensure the API key is set in the environment
	if os.Getenv("GEMINI_API_KEY") == "" {
		log.Fatal("Error: GEMINI_API_KEY environment variable is missing")
	}

	http.HandleFunc("/api/map-content", handleMapContent)
	
	port := "8081"
	fmt.Printf("Starting secure Go proxy server on :%s\n", port)
	log.Fatal(http.ListenAndServe(":"+port, nil))
}

func handleMapContent(w http.ResponseWriter, r *http.Request) {
	// 1. Handle CORS so local Canva development works
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

	// 3. Initialize Gemini Client
	ctx := context.Background()
	client, err := genai.NewClient(ctx, nil) // Automatically picks up GEMINI_API_KEY
	if err != nil {
		http.Error(w, "Failed to initialize Gemini client", http.StatusInternalServerError)
		return
	}

	// 4. Craft the Prompt
	prompt := fmt.Sprintf(`You are a presentation layout engine. 
Map the following User Content into the provided Slide Schema. 
Match the content semantically to the 'role_guess' of the elements.
Keep text concise so it fits within the dimensions provided.

Return ONLY a flat JSON object where the keys are the element 'id's and the values are the generated text.

User Content: %s

Slide Schema: %s`, req.UserContent, string(schemaBytes))

	// 5. Force Structured Output (JSON Mode)
	config := &genai.GenerateContentConfig{
		ResponseMIMEType: "application/json",
	}

	// 6. Call Gemini 2.5 Flash
	resp, err := client.Models.GenerateContent(ctx, "gemini-2.5-flash", genai.Text(prompt), config)
	if err != nil {
		log.Printf("❌ Gemini API Error Details: %v\n", err) 
        
		http.Error(w, "Gemini API error", http.StatusInternalServerError)
		return	}

	// 7. Send the mapped JSON back to the Canva extension
	w.Header().Set("Content-Type", "application/json")
	w.Write([]byte(resp.Text()))
}