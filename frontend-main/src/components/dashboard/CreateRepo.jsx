
import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import API_BASE_URL from "../../config/api";
import Navbar from "../Navbar";

export default function CreateRepo() {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();

    try {
      const response = await fetch(`${API_BASE_URL}/repo/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          description,
          owner: localStorage.getItem("userId"),
        }),
      });

      if (!response.ok) {
        alert("Repository creation failed. Check the backend endpoint.");
        return;
      }

      alert("Repository created!");
      navigate("/");
    } catch {
      alert("Could not connect to the backend.");
    }
  };

  return (
    <>
      <Navbar />
      <main style={{ maxWidth: 500, margin: "40px auto" }}>
        <h2>Create a Repository</h2>
        <form onSubmit={handleSubmit}>
          <input
            placeholder="Repository name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
          <br /><br />
          <input
            placeholder="Description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            required
          />
          <br /><br />
          <button type="submit">Create Repository</button>
        </form>
      </main>
    </>
  );
}
