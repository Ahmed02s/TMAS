import { expect, test } from "@playwright/test";

const protectedPaths = [
  "/api/courses",
  "/api/materials",
  "/api/quizzes/available",
  "/api/quizzes/completed",
  "/api/notifications",
];

test.describe("security boundary smoke tests", () => {
  for (const path of protectedPaths) {
    test(`anonymous request is rejected: ${path}`, async ({ request }) => {
      const response = await request.get(path);
      expect(response.status()).toBe(401);
    });
  }

  test("API responses include baseline security headers", async ({ request }) => {
    const response = await request.get("/health");
    expect(response.status()).toBe(200);
    expect(response.headers()["x-content-type-options"]).toBe("nosniff");
    expect(response.headers()["x-frame-options"]).toBe("DENY");
    expect(response.headers()["content-security-policy"]).toContain("default-src 'none'");
  });
});

test.describe("staging account workflows", () => {
  const email = process.env.E2E_STUDENT_EMAIL;
  const password = process.env.E2E_STUDENT_PASSWORD;
  test.skip(!email || !password, "dedicated staging student credentials are required");

  test("verified student can authenticate and use their own notification feed", async ({ request }) => {
    const login = await request.post("/api/auth/login", { data: { email, password } });
    expect(login.status()).toBe(200);
    const body = await login.json();
    expect(body.access_token).toBeTruthy();
    const notifications = await request.get("/api/notifications?role=student", {
      headers: { Authorization: `Bearer ${body.access_token}` },
    });
    expect(notifications.status()).toBe(200);
  });
});
