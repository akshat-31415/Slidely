# Slidely: Automated Presentation Engine

Slidely is an automated presentation engine designed to seamlessly convert raw, unformatted text documents into structured, professionally formatted presentation slides. By utilizing local artificial intelligence, the platform maps user context directly onto existing slide design templates without breaking layout constraints or overlapping visual layers.

---

## 💻 Tech Stack

* **Frontend:** React, TypeScript, Tailwind CSS, Canva App SDK (v2)
* **Backend Proxy:** Go (Golang)
* **Local AI Inference:** Ollama running `gemma4:e2b` (Multimodal, 128K context window variant optimized for edge constraints)

---

## 🏛️ Project Architecture

The system operates via a decoupled, three-tier architecture ensuring low latency, type safety, and local data privacy.

+---------------------------+        +--------------------------+        +-------------------------+
|     Canva App Frontend    |        |        Go Backend        |        |    Ollama Inference     |
|   (React / TypeScript)    | ---->  |          Proxy           | ---->  |         Server          |
| Extract Template Metadata |        | JSON Validation & Safety |        | (Gemma 4 Edge Execution)|
+---------------------------+        +--------------------------+        +-------------------------+


1.  **Layout Extraction (Frontend):** The React frontend leverages the Canva v2 SDK to recursively traverse the active presentation canvas. It maps out text boxes, labels, and roles (e.g., headers vs. body text) to build a flat `Deck Roster` configuration containing exact structural limitations and dimensional limits (`ideal_length`).
2.  **Mediation & Optimization (Go Proxy):** The Go backend acts as a high-performance middleware handler. It dynamically merges the raw user notes with the incoming structural layout schema and sets context configurations. It sits between the frontend and the local server to guard against parsing failures.
3.  **Deterministic AI Mapping (Ollama Layer):** The input payload is fed directly into a local `gemma4:e2b` deployment. Guided by a conditional mapping hierarchy, the model processes the parameters, aggressively summarizes lengthy inputs, respects static label constraints (e.g., keeping decorative numbering unchanged), and delivers a fully flat, predictable JSON map matching the exact node coordinates back to the canvas layout.

---

## 🛠️ Setup Instructions

Follow these exact steps to resolve networking borders between your development environments and stand up the service locally.

### Prerequisites
* Windows machine running WSL2
* Go (v1.21 or higher) installed inside your WSL environment
* Node.js and npm/pnpm installed on your system
* Ollama for Windows installed

### 0. Environment Configuration (`.env`)
In the root of your `canva-apps-sdk-starter-kit` frontend directory, create or update your `.env` configuration file with the following variables:

```env
CANVA_FRONTEND_PORT=8080
CANVA_BACKEND_PORT=3001
CANVA_BACKEND_HOST=http://localhost:3001 
CANVA_APP_ID= # TODO: Add your app's ID here to configure your backend for JWT verification
CANVA_APP_ORIGIN=# TODO: Add your app's origin here from the "Developer Portal -> Settings -> Security" to enable HMR
CANVA_HMR_ENABLED=FALSE # TODO: set to TRUE to enable HMR

### 1. Configure and Launch the Ollama Server (Windows side)
Because the Go server executes inside a virtualized WSL network space, Ollama must be explicitly instructed to bind to all internal network interfaces and reserve sufficient context space for deep JSON parsing structures.

1.  Fully close any existing Ollama background tasks running in your system tray.
2.  Open an administrative Windows Command Prompt or PowerShell terminal and run the following configuration commands:
    ```cmd
    set OLLAMA_HOST=0.0.0.0
    set OLLAMA_NUM_CTX=16384
    ollama serve
    ```
3.  In a separate Windows Command Prompt terminal tab, pull the lightweight Gemma 4 edge engine:
    ```cmd
    ollama pull gemma4:e2b
    ```

### 2. Configure and Run the Backend Proxy (WSL side)
1.  Navigate into your WSL shell terminal and move to your proxy source path:
    ```bash
    cd /code/slidely/canva-gemini-proxy
    ```
2.  Determine the live virtual router gateway IP assigned to your Windows environment by inspecting your network resolution definitions:
    ```bash
    cat /etc/resolv.conf
    ```
    *Locate the line reading `nameserver 172.XX.XX.XX`. Copy this specific IP.*
3.  Open `main.go` and update the global target configuration constant with your current server address:
    ```go
    const ollamaURL = "http://YOUR_COPIED_NAMESERVER_IP:11434/api/generate"
    ```
4.  Launch the secure Go proxy service:
    ```bash
    go run main.go
    ```
    *The console should output: `Starting secure Go proxy server on :8081`*

### 3. Initialize the Canva's Frontend
1.  Navigate to canva-apps-sdk-starter-kit folder.
2.  Install all required dependencies and initiate the local canvas server sequence:
    ```bash
    npm install
    npm run dev
    ```
3.  Load your development frame URL inside your designated Canva app preview panel, input your source text documents, and trigger the layout generation button to dynamically pop your text straight onto the canvas workspace!