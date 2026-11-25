const fs = require("fs");

const replacements = {
  "src/components/auth/Login.jsx": [
    ['"http://localhost:3002/login"', '`${API_BASE_URL}/login`']
  ],
  "src/components/auth/Signup.jsx": [
    ['"http://localhost:3002/signup"', '`${API_BASE_URL}/signup`']
  ],
  "src/components/dashboard/Dashboard.jsx": [
    ['`http://localhost:3002/repo/user/${userId}`', '`${API_BASE_URL}/repo/user/${userId}`'],
    ['`http://localhost:3002/repo/all`', '`${API_BASE_URL}/repo/all`']
  ],
  "src/components/user/Profile.jsx": [
    ['`http://localhost:3002/userProfile/${userId}`', '`${API_BASE_URL}/userProfile/${userId}`']
  ]
};

for (const [file, pairs] of Object.entries(replacements)) {
  let content = fs.readFileSync(file, "utf8");
  for (const [from, to] of pairs) {
    content = content.replaceAll(from, to);
  }
  fs.writeFileSync(file, content);
}

console.log("URL replacements checked.");
