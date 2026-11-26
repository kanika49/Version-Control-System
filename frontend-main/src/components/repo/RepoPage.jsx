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

  // code browser
  const [branch, setBranch] = useState(null);
  const [tab, setTab] = useState("code");
  const [dir, setDir] = useState("");
  const [entries, setEntries] = useState(null); // null = still loading
  const [file, setFile] = useState(null);
  const [commits, setCommits] = useState(null);
  const [browseError, setBrowseError] = useState("");

  const userId = localStorage.getItem("userId");

  useEffect(() => {
    let cancelled = false;
    setState("loading");
    (async () => {
      try {
        const res = await api.get(`/repo/${id}`);
        if (cancelled) return;
        setRepo(res.data);
        const branches = res.data.branches ?? [];
        setBranch((branches.find((b) => b.name === "main") || branches[0])?.name ?? null);
        setState("ready");
      } catch (err) {
        const status = err.response?.status;
        if (!cancelled) setState(status === 404 || status === 400 ? "notfound" : "error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  // Folder contents for the chosen branch and folder.
  useEffect(() => {
    if (!branch) return;
    let cancelled = false;
    setEntries(null);
    setBrowseError("");
    api
      .get(`/repo/${id}/tree`, { params: { ref: branch, path: dir } })
      .then((res) => !cancelled && setEntries(res.data.entries))
      .catch(() => {
        if (!cancelled) {
          setBrowseError("Could not load this folder.");
          setEntries([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [id, branch, dir]);

  // Commit list for the chosen branch.
  useEffect(() => {
    if (!branch || tab !== "commits") return;
    let cancelled = false;
    setCommits(null);
    api
      .get(`/repo/${id}/commits`, { params: { branch } })
      .then((res) => !cancelled && setCommits(res.data))
      .catch(() => !cancelled && setCommits([]));
    return () => {
      cancelled = true;
    };
  }, [id, branch, tab]);

  const isOwner = Boolean(repo?.owner && userId && String(repo.owner._id) === String(userId));
  const branches = repo?.branches ?? [];

  const changeBranch = (name) => {
    setBranch(name);
    setDir("");
    setFile(null);
  };
  const goTo = (path) => {
    setDir(path);
    setFile(null);
  };
  const openEntry = async (entry) => {
    const path = dir ? `${dir}/${entry.name}` : entry.name;
    if (entry.type === "tree") return goTo(path);
    try {
      setBrowseError("");
      const res = await api.get(`/repo/${id}/blob`, { params: { ref: branch, path } });
      setFile({ path, ...res.data });
    } catch {
      setBrowseError("Could not open this file.");
    }
  };

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

  const crumbs = dir.split("/").filter(Boolean);

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

        {branches.length === 0 ? (
          <div className="repo-card">
            <h3>This repository is empty</h3>
            <p>Push your first commit from your project folder:</p>
            <pre>{`kgit login
kgit init
kgit remote ${id}
kgit add .
kgit commit "first commit"
kgit push`}</pre>
          </div>
        ) : (
          <>
            <div className="repo-toolbar">
              <select aria-label="Branch" value={branch} onChange={(e) => changeBranch(e.target.value)}>
                {branches.map((b) => (
                  <option key={b.name} value={b.name}>{b.name}</option>
                ))}
              </select>
              <span className="repo-meta" style={{ margin: 0 }}>
                Clone: <code>kgit clone {id}</code>
              </span>
            </div>

            <div className="repo-tabs">
              <button className={`repo-tab ${tab === "code" ? "active" : ""}`} onClick={() => setTab("code")}>Code</button>
              <button className={`repo-tab ${tab === "commits" ? "active" : ""}`} onClick={() => setTab("commits")}>Commits</button>
            </div>

            {tab === "code" && (
              <>
                <div className="breadcrumb">
                  <button onClick={() => goTo("")}>{repo.name}</button>
                  {crumbs.map((c, i) => (
                    <span key={i}>
                      {" / "}
                      <button onClick={() => goTo(crumbs.slice(0, i + 1).join("/"))}>{c}</button>
                    </span>
                  ))}
                  {file && <span> / {file.path.split("/").pop()}</span>}
                </div>

                {browseError && <p className="form-error" role="alert">{browseError}</p>}

                {file ? (
                  <div>
                    <p className="repo-meta">{file.size} bytes</p>
                    {file.binary ? (
                      <p>This is a binary file, so it cannot be shown here.</p>
                    ) : (
                      <pre className="code-view">{file.content}</pre>
                    )}
                    {file.truncated && <p className="repo-meta">Only the first part of this large file is shown.</p>}
                  </div>
                ) : entries === null ? (
                  <p>Loading...</p>
                ) : entries.length === 0 ? (
                  <p>This folder is empty.</p>
                ) : (
                  <div className="file-list">
                    {entries.map((e) => (
                      <button key={e.name} className="file-row" onClick={() => openEntry(e)}>
                        <span aria-hidden="true">{e.type === "tree" ? "📁" : "📄"}</span>
                        {e.name}
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}

            {tab === "commits" &&
              (commits === null ? (
                <p>Loading...</p>
              ) : commits.length === 0 ? (
                <p>No commits.</p>
              ) : (
                commits.map((c) => (
                  <div className="commit-row" key={c.hash}>
                    <div className="msg">
                      {c.message.split("\n")[0]}{" "}
                      {c.parents.length > 1 && <span className="repo-badge">merge</span>}
                    </div>
                    <div className="meta">
                      <span className="commit-hash">{c.hash.slice(0, 8)}</span> · {c.author} ·{" "}
                      {new Date(c.time).toLocaleString()}
                    </div>
                  </div>
                ))
              ))}
          </>
        )}

        {isOwner && (
          <div className="repo-card" style={{ marginTop: 24 }}>
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