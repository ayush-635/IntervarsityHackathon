const puzzles = [
  { question: "What is 2 + 2?", answer: "4" },
  { question: "Type 'hello' backwards", answer: "olleh" },
  { question: "Which of these is a phishing red flag? a) Grammar mistakes b) Correct spelling", answer: "a" },
  { question: "Decode this Caesar cipher: 'khoor'", answer: "hello" },
  { question: "What is the strongest password: a) 12345 b) P@ssw0rd!23", answer: "b" },
  { question: "Identify the fake email: contains suspicious link or unusual sender?", answer: "contains suspicious link" },
  { question: "Complete the sequence: 2, 4, 8, ?", answer: "16" },

  { question: "What does 'HTTPS' stand for?", answer: "HyperText Transfer Protocol Secure" },
  { question: "Which is safer for authentication: a) SMS code b) Authenticator app", answer: "b" },
  { question: "What type of attack floods a system with traffic?", answer: "DDoS" },
  { question: "Which of these is a strong security practice? a) Reusing passwords b) Using MFA", answer: "b" },
  { question: "In cybersecurity, what does SQL injection target?", answer: "Databases" },
  { question: "What is the purpose of a firewall?", answer: "To block unauthorized access" },
  { question: "Which file type is most risky to open from unknown sources? a) .txt b) .exe", answer: "b" },
  { question: "Ransomware typically does what to your files?", answer: "Encrypts them" },
  { question: "What does VPN stand for?", answer: "Virtual Private Network" },
  { question: "What does 'zero-day vulnerability' mean?", answer: "An unknown security flaw with no patch" },

  { 
    question: "You receive an email from 'support@paypa1.com' asking you to log in via a link. What should you do?", 
    answer: "Do not click, it's a phishing email" 
  },
  { 
    question: "Your computer suddenly shows a message demanding Bitcoin to unlock your files. What attack is this?", 
    answer: "Ransomware" 
  },
  { 
    question: "You notice multiple failed login attempts from foreign countries on your account. What’s the likely attack?", 
    answer: "Brute force attack" 
  },
  { 
    question: "A website asks you to enter personal details, but the URL starts with 'http://' instead of 'https://'. What’s the risk?", 
    answer: "Data can be intercepted (no encryption)" 
  },
  { 
    question: "You plug in a free USB drive you found, and your system installs unknown software. What attack is this?", 
    answer: "Malware via infected USB" 
  },
  { 
    question: "Your coworker receives a call from 'IT support' asking for their password. What attack is this?", 
    answer: "Social engineering" 
  },
  { 
    question: "A program you downloaded secretly mines cryptocurrency using your CPU. What type of malware is this?", 
    answer: "Cryptojacking" 
  },
  { 
    question: "Your Wi-Fi traffic is being intercepted at a coffee shop's free hotspot. What attack is happening?", 
    answer: "Man-in-the-middle attack" 
  }
];

export default puzzles;
