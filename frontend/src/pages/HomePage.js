import React, { useEffect, useState } from "react";

export default function HomePage() {
  const [homeText, setHomeText] = useState("");
  const [showSurvey, setShowSurvey] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [favoritesVisible, setFavoritesVisible] = useState(true);

  useEffect(() => {
    setHomeText("Your document tools in one secure place");
  }, []);

  const features = [
    {
      id: "redact",
      icon: "🖊️",
      title: "Redact PDF",
      description: "Remove sensitive content",
      tags: ["security"]
    },
    {
      id: "multi-tool",
      icon: "🛠️",
      title: "Multi-Tool",
      description: "Bundle many tools together",
      tags: ["organize"]
    },
    {
      id: "validate-signature",
      icon: "✔️",
      title: "Validate Signature",
      description: "Check document authenticity",
      tags: ["security"]
    }
  ];

  const filteredFeatures = features.filter(f =>
    f.title.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div style={{ padding: "2rem" }}>
      <h1>{homeText}</h1>

      <div style={{ margin: "1rem 0" }}>
        <input
          type="text"
          placeholder="Search tools..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          style={{ padding: "0.5rem", width: "200px" }}
        />

        <select style={{ marginLeft: "1rem", padding: "0.5rem" }}>
          <option value="alphabetical">Alphabetical</option>
          <option value="global">Global Popularity</option>
        </select>

        <button
          onClick={() => setFavoritesVisible(!favoritesVisible)}
          style={{ marginLeft: "1rem", padding: "0.5rem" }}
        >
          {favoritesVisible ? "Hide" : "Show"} Favorites
        </button>
      </div>

      {favoritesVisible && (
        <div style={{ margin: "1rem 0" }}>
          <h2>Favorite Tools</h2>
          <p>(You can add favorites here later)</p>
        </div>
      )}

      <div>
        <h2>Recent Features</h2>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "1rem" }}>
          {filteredFeatures.map((f) => (
            <div
              key={f.id}
              style={{
                border: "1px solid #ccc",
                padding: "1rem",
                borderRadius: "8px",
                width: "200px"
              }}
            >
              <div style={{ fontSize: "2rem" }}>{f.icon}</div>
              <h3>{f.title}</h3>
              <p>{f.description}</p>
              <small>{f.tags.join(", ")}</small>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
