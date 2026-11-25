import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import "./dashboard.css";
import "../repo/repo.css";
import Navbar from "../Navbar";
import api from "../../api";

const RepoItem = ({ repo }) => (
  <div className="repo-list-item">
    <h4>
      <Link to={`/repo/${repo._id}`}>{repo.name}</Link>{" "}
      {repo.visibility === false && <span className="repo-badge">Private</span>}
    </h4>
    <h4>{repo.description}</h4>
  </div>
);

const Dashboard = () => {
  const [repositories, setRepositories] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [suggestedRepositories, setSuggestedRepositories] = useState([]);
  const [searchResults, setSearchResults] = useState([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const userId = localStorage.getItem("userId");

    const fetchRepositories = async () => {
      try {
        const res = await api.get(`/repo/user/${userId}`);
        // The list must always be an array, otherwise .map() crashes the page
        setRepositories(res.data.repositories ?? []);
      } catch (err) {
        console.error("Error while fetching repositories: ", err);
        setRepositories([]);
      } finally {
        setLoaded(true);
      }
    };

    const fetchSuggestedRepositories = async () => {
      try {
        const res = await api.get("/repo/all");
        setSuggestedRepositories(Array.isArray(res.data) ? res.data : []);
      } catch (err) {
        console.error("Error while fetching suggested repositories: ", err);
        setSuggestedRepositories([]);
      }
    };

    fetchRepositories();
    fetchSuggestedRepositories();
  }, []);

  useEffect(() => {
    if (searchQuery === "") {
      setSearchResults(repositories);
    } else {
      setSearchResults(
        repositories.filter((repo) => repo.name.toLowerCase().includes(searchQuery.toLowerCase()))
      );
    }
  }, [searchQuery, repositories]);

  return (
    <>
      <Navbar />
      <section id="dashboard">
        <aside>
          <h3>Explore repositories</h3>
          {suggestedRepositories.length === 0 && <p>No public repositories yet.</p>}
          {suggestedRepositories.map((repo) => (
            <RepoItem key={repo._id} repo={repo} />
          ))}
        </aside>

        <main>
          <h2>Your Repositories</h2>
          <div className="repo-actions" style={{ marginBottom: 12 }}>
            <Link to="/create" className="repo-btn primary" style={{ textDecoration: "none" }}>
              New repository
            </Link>
          </div>
          <div id="search">
            <input
              type="text"
              value={searchQuery}
              placeholder="Search..."
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          {loaded && repositories.length === 0 && (
            <p>You don't have any repositories yet. Create your first one!</p>
          )}
          {loaded && repositories.length > 0 && searchResults.length === 0 && <p>No matches.</p>}
          {searchResults.map((repo) => (
            <RepoItem key={repo._id} repo={repo} />
          ))}
        </main>

        <aside>
          <h3>Quick start</h3>
          <pre>{`kgit init
kgit add .
kgit commit "message"
kgit branch feature
kgit merge feature`}</pre>
        </aside>
      </section>
    </>
  );
};

export default Dashboard;