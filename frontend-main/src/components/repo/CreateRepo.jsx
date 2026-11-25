import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../../api";
import Navbar from "../Navbar";
import "./repo.css";

// Same rule the server enforces: letters, numbers, dot, dash, underscore, up to 100 characters.
const NAME_RULE = /^[\w.-]{1,100}$/;

const CreateRepo = () => {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isPublic, setIsPublic] = useState(true);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    const trimmed = name.trim();
    if (!NAME_RULE.test(trimmed)) {
      setError("Name can use letters, numbers, dots, dashes and underscores only (max 100 characters).");
      return;
    }

    try {
      setLoading(true);
      const res = await api.post("/repo/create", {
        name: trimmed,
        description: description.trim() || undefined,
        visibility: isPublic,
      });
      navigate(`/repo/${res.data.repositoryID}`);
    } catch (err) {
      const data = err.response?.data;
      if (err.response?.status === 409) setError("You already have a repository with that name.");
      else if (data?.errors) setError(data.errors.map((x) => `${x.field}: ${x.message}`).join(" "));
      else setError(data?.message || "Could not create the repository. Is the server running?");
      setLoading(false);
    }
  };

  return (
    <>
      <Navbar />
      <div className="create-repo">
        <h2>Create a new repository</h2>
        <p className="hint">A repository holds your project's files and their history.</p>

        <form onSubmit={handleSubmit}>
          <label htmlFor="repo-name">Repository name *</label>
          <input
            id="repo-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="my-project"
            autoComplete="off"
          />

          <label htmlFor="repo-desc">Description (optional)</label>
          <textarea
            id="repo-desc"
            rows={3}
            maxLength={500}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />

          <label>Visibility</label>
          <label className="visibility-option">
            <input type="radio" name="visibility" checked={isPublic} onChange={() => setIsPublic(true)} />
            <span>
              Public
              <small>Anyone can see this repository.</small>
            </span>
          </label>
          <label className="visibility-option">
            <input type="radio" name="visibility" checked={!isPublic} onChange={() => setIsPublic(false)} />
            <span>
              Private
              <small>Only you can see this repository.</small>
            </span>
          </label>

          {error && <p className="form-error" role="alert">{error}</p>}

          <div className="repo-actions" style={{ marginTop: 20 }}>
            <button type="submit" className="repo-btn primary" disabled={loading}>
              {loading ? "Creating..." : "Create repository"}
            </button>
            <button type="button" className="repo-btn" onClick={() => navigate("/")}>
              Cancel
            </button>
          </div>
        </form>
      </div>
    </>
  );
};

export default CreateRepo;