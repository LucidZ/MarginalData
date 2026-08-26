import { useEffect, useState } from "react";
import "./ContactForm.css";

// Ported from javilabs.dev's ContactModal (/Users/lucas/code/JaviLabs) —
// same Formspark endpoint and BotPoison key, so submissions from this site
// land in the same inbox as the rest of the Javi Labs LLC properties.
// Rendered inline here rather than as a popup modal; JaviLabs.dev needed a
// modal because it's triggered from many CTAs across a landing page, this
// site just needs one contact point on the Privacy page.
const FORMSPARK_FORM_ID = "UYtrJ0oQz";
const BOTPOISON_PUBLIC_KEY = "pk_0b5ee14f-cc9f-41ed-badb-3a63058d8f36";

declare global {
  interface Window {
    Botpoison?: new (opts: { publicKey: string }) => {
      challenge: () => Promise<{ solution: string }>;
    };
  }
}

const SUBJECTS = [
  "General Question",
  "Data Source / Correction",
  "Privacy Inquiry",
  "Consulting Inquiry",
  "Other",
];

export default function ContactForm() {
  const [formData, setFormData] = useState({
    email: "",
    subject: "",
    message: "",
    // Honeypot — disguised as a real field to catch bots.
    phone: "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState<"success" | "error" | null>(null);

  useEffect(() => {
    const script = document.createElement("script");
    script.src = "https://unpkg.com/@botpoison/browser";
    script.async = true;
    document.head.appendChild(script);
    return () => {
      if (document.head.contains(script)) document.head.removeChild(script);
    };
  }, []);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setSubmitStatus(null);

    try {
      if (formData.phone) {
        // Honeypot triggered — silently drop instead of tipping off the bot.
        setSubmitStatus("error");
        setIsSubmitting(false);
        return;
      }

      let botpoisonSolution: { solution: string } | null = null;
      if (window.Botpoison) {
        try {
          const botpoison = new window.Botpoison({ publicKey: BOTPOISON_PUBLIC_KEY });
          botpoisonSolution = await botpoison.challenge();
        } catch {
          // Continue without it — Formspark's own filtering still applies.
        }
      }

      const { phone: _phone, ...formDataWithoutHoneypot } = formData;
      const payload = {
        ...formDataWithoutHoneypot,
        ...(botpoisonSolution && { _botpoison: botpoisonSolution.solution }),
      };

      const response = await fetch(`https://submit-form.com/${FORMSPARK_FORM_ID}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        setSubmitStatus("success");
        setFormData({ email: "", subject: "", message: "", phone: "" });
      } else {
        setSubmitStatus("error");
      }
    } catch {
      setSubmitStatus("error");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (submitStatus === "success") {
    return (
      <p className="contact-form-success">
        Message sent — thanks for reaching out, I'll get back to you soon.
      </p>
    );
  }

  return (
    <form className="contact-form" onSubmit={handleSubmit}>
      <div className="contact-form-row">
        <label htmlFor="email">Email address</label>
        <input
          type="email"
          id="email"
          name="email"
          required
          value={formData.email}
          onChange={handleChange}
          disabled={isSubmitting}
          placeholder="your@email.com"
        />
      </div>

      <div className="contact-form-row">
        <label htmlFor="subject">Subject</label>
        <select
          id="subject"
          name="subject"
          required
          value={formData.subject}
          onChange={handleChange}
          disabled={isSubmitting}
        >
          <option value="">Select a topic…</option>
          {SUBJECTS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>

      <div className="contact-form-row">
        <label htmlFor="message">Message</label>
        <textarea
          id="message"
          name="message"
          required
          rows={5}
          value={formData.message}
          onChange={handleChange}
          disabled={isSubmitting}
        />
      </div>

      {/* Honeypot — hidden from sighted users and screen readers. */}
      <input
        type="tel"
        name="phone"
        value={formData.phone}
        onChange={handleChange}
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        className="contact-form-honeypot"
      />

      {submitStatus === "error" && (
        <p className="contact-form-error">
          Something went wrong — please try again in a moment.
        </p>
      )}

      <button type="submit" disabled={isSubmitting}>
        {isSubmitting ? "Sending…" : "Send message"}
      </button>
    </form>
  );
}
