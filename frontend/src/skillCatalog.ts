// Skill ক্যাটালগ: category → skill-এর নাম।
// একই নাম একাধিক category-তে থাকতে পারে, ডাটাবেসে সেটা একটাই skill হিসেবে থাকে।
export const SKILL_CATALOG: { category: string; skills: string[] }[] = [
  {
    category: "Frontend",
    skills: [
      "HTML5", "CSS3", "JavaScript", "TypeScript", "React.js", "Next.js", "Vue.js", "Angular", "Svelte",
      "Tailwind CSS", "Bootstrap", "Material UI (MUI)", "Sass / SCSS", "Responsive Web Design", "UI Development",
      "Accessibility (WCAG)", "Web Performance Optimization", "Cross-Browser Compatibility",
      "Progressive Web Apps (PWA)", "Vite", "Redux Toolkit", "Zustand",
    ],
  },
  {
    category: "Backend",
    skills: [
      "Node.js", "Express.js", "NestJS", "Python", "Django", "Flask", "FastAPI", "Java", "Spring Boot", "PHP",
      "Laravel", "C#", "ASP.NET Core", "Go (Golang)", "Ruby on Rails", "REST API Development", "GraphQL",
      "Authentication & Authorization", "JWT Authentication", "OAuth 2.0", "WebSockets", "Server-Side Development",
      "Microservices Architecture", "API Documentation (Swagger / OpenAPI)",
    ],
  },
  {
    category: "Programming Languages",
    skills: [
      "C", "C++", "C#", "Java", "Python", "JavaScript", "TypeScript", "PHP", "Go", "Rust", "Kotlin", "Swift",
      "Dart", "Ruby", "R", "MATLAB", "SQL", "Bash / Shell Scripting",
    ],
  },
  {
    category: "Database",
    skills: [
      "MySQL", "PostgreSQL", "SQLite", "Microsoft SQL Server", "Oracle Database", "MongoDB", "Redis", "Firebase",
      "Supabase", "Neon", "Database Design", "ER Diagram", "Database Normalization", "SQL Queries",
      "Joins & Subqueries", "Stored Procedures", "Indexing & Query Optimization", "Transactions & ACID",
      "Database Backup & Recovery", "Database Security", "Prisma ORM", "Sequelize ORM", "Mongoose ODM",
    ],
  },
  {
    category: "Software Engineering",
    skills: [
      "Object-Oriented Programming (OOP)", "Data Structures", "Algorithms", "Design Patterns", "Clean Code",
      "SOLID Principles", "Software Development Life Cycle (SDLC)", "Agile Methodology", "Scrum",
      "Requirement Analysis", "System Design", "Software Architecture", "UML Diagrams", "Unit Testing",
      "Integration Testing", "System Testing", "Debugging", "Code Review", "Refactoring", "Documentation",
      "Version Control", "Git", "GitHub", "GitLab", "Bitbucket",
    ],
  },
  {
    category: "AI & ML",
    skills: [
      "Artificial Intelligence (AI)", "Machine Learning", "Deep Learning", "Generative AI",
      "Natural Language Processing (NLP)", "Computer Vision", "Reinforcement Learning", "Neural Networks",
      "Data Preprocessing", "Feature Engineering", "Model Training & Evaluation", "Scikit-learn", "TensorFlow",
      "PyTorch", "Keras", "OpenCV", "NumPy", "Pandas", "Matplotlib", "Seaborn", "Jupyter Notebook",
      "Large Language Models (LLMs)", "Prompt Engineering", "AI API Integration",
      "Retrieval-Augmented Generation (RAG)",
    ],
  },
  {
    category: "Cybersecurity",
    skills: [
      "Cybersecurity Fundamentals", "Ethical Hacking", "Network Security", "Web Application Security",
      "Penetration Testing", "Vulnerability Assessment", "Security Auditing", "OWASP Top 10", "Cryptography",
      "Encryption & Decryption", "Authentication Security", "Identity & Access Management", "Digital Forensics",
      "Incident Response", "Malware Analysis", "Secure Coding", "Linux Security", "Firewall Configuration",
      "SIEM Fundamentals", "Burp Suite", "Wireshark", "Nmap", "Metasploit", "Security Information Analysis",
    ],
  },
  {
    category: "Linux & OS",
    skills: [
      "Linux Command Line", "Bash Scripting", "Shell Programming", "Process Management", "Memory Management",
      "File System Management", "File Permissions", "User & Group Management", "ACL", "System Monitoring",
      "Resource Management", "System Administration", "Service Management (systemd)", "Package Management",
      "Cron Jobs", "Log Management", "Linux Networking", "Operating System Concepts", "Virtualization",
      "Windows Administration",
    ],
  },
  {
    category: "Networking",
    skills: [
      "Computer Networking", "OSI Model", "TCP/IP Model", "IP Addressing", "IPv4 / IPv6", "Subnetting", "DNS",
      "DHCP", "HTTP / HTTPS", "TCP / UDP", "Routing & Switching", "VLAN Configuration", "NAT", "VPN",
      "Firewall Basics", "Wireless Networking", "Network Troubleshooting", "Cisco Packet Tracer", "Wireshark",
      "CCNA Fundamentals", "Network Security",
    ],
  },
  {
    category: "DevOps & Cloud",
    skills: [
      "Linux Server Administration", "Docker", "Kubernetes", "CI/CD", "Jenkins", "GitHub Actions", "GitLab CI/CD",
      "AWS", "Microsoft Azure", "Google Cloud Platform (GCP)", "Cloud Computing", "Infrastructure as Code",
      "Terraform", "Ansible", "Nginx", "Apache", "Load Balancing", "Monitoring & Logging", "Server Deployment",
      "Vercel", "Render", "Netlify", "Database Deployment", "Cloud Security", "Serverless Computing",
    ],
  },
  {
    category: "Mobile",
    skills: [
      "Android Development", "iOS Development", "Flutter", "Dart", "React Native", "Kotlin", "Swift",
      "Android Studio", "Mobile UI Design", "API Integration", "Firebase Integration", "Local Database Storage",
      "Push Notifications", "Mobile App Testing", "App Deployment",
    ],
  },
  {
    category: "Data Science",
    skills: [
      "Data Analysis", "Data Visualization", "Statistical Analysis", "Probability & Statistics", "Excel",
      "Power BI", "Tableau", "SQL Analytics", "Python for Data Science", "Pandas", "NumPy", "Matplotlib",
      "Exploratory Data Analysis (EDA)", "Data Cleaning", "Data Mining", "Predictive Analytics",
      "Business Intelligence", "Big Data Fundamentals", "Apache Spark", "Data Warehousing", "ETL Pipelines",
    ],
  },
  {
    category: "Testing & QA",
    skills: [
      "Manual Testing", "Software Test Planning", "Test Case Design", "Test Scenario Writing", "Bug Reporting",
      "Regression Testing", "Smoke Testing", "API Testing", "Postman", "Selenium", "Playwright", "Cypress", "Jest",
      "Vitest", "Pytest", "JUnit", "Performance Testing", "Load Testing", "Security Testing", "Test Automation",
    ],
  },
  {
    category: "UI/UX",
    skills: [
      "UI Design", "UX Design", "Wireframing", "Prototyping", "User Research", "User Flow Design", "Design Systems",
      "Figma", "Adobe XD", "Responsive Interface Design", "Usability Testing", "Accessibility Design",
      "Visual Hierarchy", "Interaction Design",
    ],
  },
];