import axios from "axios";

export const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3002";

const api = axios.create({ baseURL: API_URL });

// Attach the login token to every request.
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// If the token expired, log out and go to the login page.
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401 && window.location.pathname !== "/auth") {
      localStorage.removeItem("token");
      localStorage.removeItem("userId");
      window.location.href = "/auth";
    }
    return Promise.reject(err);
  }
);

export default api;