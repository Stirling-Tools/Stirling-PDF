import { useState } from "react";
import reactLogo from "./assets/react.svg";
import { appendToFilename } from './utils/file-utils';
import { openFiles, downloadFile } from './utils/tauri-wrapper'
import { rotatePages } from './utils/pdf-operations';
import "./App.css";

function App() {
  const [greetMsg, setGreetMsg] = useState("");
  const [name, setName] = useState("");

  async function greet() {
    // Learn more about Tauri commands at https://tauri.app/v1/guides/features/command
    setGreetMsg(`Hello, ${name}! You've been greeted from Tauri!`);
  }
  async function rotatePdf() {
    var selected = await openFiles({
      multiple: false,
      filters: [{
        name: 'PDF',
        extensions: ['pdf']
      }]
    })
    
    if (!selected) return;
    selected

    const rotated = await rotatePages(selected[0].data, 90);
    console.log(rotated);

    const appendedPath = appendToFilename(selected[0].getPath(), "_rotated");
    console.log(appendedPath)

    await downloadFile(rotated, {
      defaultPath: appendedPath,
      filters: [{
        name: "PDF",
        extensions: ['pdf']
      }]
    });
    console.log("done!")
  }

  return (
    <div className="container">
      <h1>Welcome to Tauri!</h1>

      <div className="row">
        <a href="https://vitejs.dev" target="_blank">
          <img src="/vite.svg" className="logo vite" alt="Vite logo" />
        </a>
        <a href="https://tauri.app" target="_blank">
          <img src="/tauri.svg" className="logo tauri" alt="Tauri logo" />
        </a>
        <a href="https://reactjs.org" target="_blank">
          <img src={reactLogo} className="logo react" alt="React logo" />
        </a>
      </div>

      <p>Click on the Tauri, Vite, and React logos to learn more.</p>

      <form
        className="row"
        onSubmit={(e) => {
          e.preventDefault();
          greet();
        }}
      >
        <input
          id="greet-input"
          onChange={(e) => setName(e.currentTarget.value)}
          placeholder="Enter a name..."
        />
        <button type="submit">Greet</button>
      </form>

      <button onClick={rotatePdf}>Rotate 90</button>

      <p>{greetMsg}</p>
    </div>
  );
}

export default App;
