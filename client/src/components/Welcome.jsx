const STARTER_QUESTIONS = [
  "Explain how APIs work in simple terms",
  "Give me a creative side-project idea",
  "Help me write a polite follow-up email",
  "Tell me a surprising fun fact",
];

export default function Welcome({ onPick }) {
  return (
    <div className="welcome">
      <div className="bot-logo"></div>
      <h1>Welcome to AI Assistant</h1>
      <p>
        I&apos;m here to help you with anything you need. Ask me questions, get creative ideas, or just have a
        conversation!
      </p>
      <div className="starters" role="group" aria-label="Suggested questions">
        {STARTER_QUESTIONS.map((q) => (
          <button key={q} type="button" className="starter" onClick={() => onPick(q)}>
            {q}
          </button>
        ))}
      </div>
    </div>
  );
}
