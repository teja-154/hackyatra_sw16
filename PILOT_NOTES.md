# Pilot & Presentation Notes

These notes are explicitly for the hackathon pitch and judges to clarify the scope, assumptions, and production-readiness of the COC-Sync platform.

### A. Infrastructure & Data Security
For this prototype, we are utilizing free-tier third-party services (MongoDB Atlas, Groq API, Cloudinary) to ensure rapid development and reliable uptime during the demonstration. **In a production environment, this would be migrated entirely to GVMC-approved or on-premise data hosting.** All sensitive citizen data and CCTV footage must remain within local government data centers to comply with strict data sovereignty and security policies.

### B. Fallback Routing & Human-in-the-Loop
The AI correlation engine is designed to be highly accurate, but it is not a black box. **Any signal with low confidence, or any category-department mismatch, is automatically routed to the "GVMC General" queue for human review.** We prioritize accuracy over automation—if the system is unsure, it fails safely to a human dispatcher rather than incorrectly auto-assigning a field team.

### C. Zero-Training Field Interface
The Department and Field Team UI has been explicitly designed for **zero-training use by operations staff.** It features an opinionated, two-button workflow ("Assign Team" and "Resolve Issue") with no unnecessary menus, analytics, or complex configurations. This ensures that field workers and department managers can adopt the system instantly without massive retraining programs, saving the city time and money on deployment.
