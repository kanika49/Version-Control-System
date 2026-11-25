import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import api from "../../api";
import Navbar from "../Navbar";
import "./repo.css";

const RepoPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [repo, setRepo] = useState(null);
  const [state, setState] = useState("loading"); // loading | ready | notfound | error
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const userId = localStorage.getItem("userId");

  useEffect(() => {
    let cancelled = false;
    setState("loading");
    (async () => {
      try {
        const res = await api.get(`/repo/${id}`);
        if (!cancelled) {
          setRepo(res.data);
          setState("ready");
        }
      } catch (err) {
        const status = err.response?.status;
        if (!cancelled) setState(status === 404 || status === 400 ? "notfound" : "error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const isOwner = Boolean(repo?.owner && userId && String(repo.owner._id) === String(userId));

  const toggleVisibility = async () => {
    try {
      setBusy(true);
      setMessage("");
      const res = await api.patch(`/repo/toggle/${id}`);
      setRepo((prev) => ({ ...prev, visibility: res.data.repository.visibility }));
    } catch {
      setMessage("Could not change visibility.");
    } finally {
      setBusy(false);
    }
  };

  const deleteRepo = async () => {
    if (!window.confirm(`Delete "${repo.name}"? This cannot be undone.`)) return;
    try {
      setBusy(true);
      setMessage("");
      await api.delete(`/repo/delete/${id}`);
      navigate("/");
    } catch {
      setMessage("Could not delete the repository.");
      setBusy(false);
    }
  };

  if (state === "loading") {
    return (
      <>
        <Navbar />
        <div className="repo-page"><p>Loading...</p></div>
      </>
    );
  }

  if (state !== "ready") {
    return (
      <>
        <Navbar />
        <div className="repo-page">
          <h2>{state === "notfound" ? "Repository not found" : "Something went wrong"}</h2>
          <p className="repo-meta">
            {state === "notfound"
              ? "It may not exist, or it may be private."
              : "Could not reach the server. Please try again."}
          </p>
          <button className="repo-btn" onClick={() => navigate("/")}>Back to dashboard</button>
        </div>
      </>
    );
  }

  return (
    <>
      <Navbar />
      <div className="repo-page">
        <div className="repo-title">
          <h2>{repo.name}</h2>
          <span className="repo-badge">{repo.visibility ? "Public" : "Private"}</span>
        </div>
        <p className="repo-meta">
          Owner: {repo.owner?.username ?? "unknown"} · Created{" "}
          {new Date(repo.createdAt).toLocaleDateString()} · {repo.issues?.length ?? 0} issue(s)
        </p>

        <p className="repo-description">{repo.description || "No description provided."}</p>

        <div className="repo-card">
          <h3>Start tracking files</h3>
          <p>Use the kgit command line in your project folder:</p>
          <pre>{`kgit init
kgit add .
kgit commit "first commit"
kgit log`}</pre>
          <p className="repo-meta" style={{ marginBottom: 0 }}>
            Pushing and pulling files to this page is coming in a later step.
          </p>
        </div>

        {isOwner && (
          <div className="repo-card">
            <h3>Settings</h3>
            <div className="repo-actions">
              <button className="repo-btn" onClick={toggleVisibility} disabled={busy}>
                Make {repo.visibility ? "private" : "public"}
              </button>
              <button className="repo-btn danger" onClick={deleteRepo} disabled={busy}>
                Delete repository
              </button>
            </div>
            {message && <p className="form-error" role="alert">{message}</p>}
          </div>
        )}
      </div>
    </>
  );
};

export default RepoPage;