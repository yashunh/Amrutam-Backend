import { Router } from "express";
import { authenticate } from "../../middleware/authenticate";
import { redisRateLimit } from "../../middleware/rate-limit";
import { validate } from "../../middleware/validate";
import { asyncHandler } from "../../utils/async-handler";
import { loginSchema, refreshSchema, registerSchema } from "./auth.schemas";
import * as authService from "./auth.service";

export const authRouter = Router();

authRouter.post(
  "/register",
  redisRateLimit({ prefix: "rl:register", windowSeconds: 900, max: 8 }),
  validate(registerSchema),
  asyncHandler(async (req, res) => {
    const body = req.body as {
      email: string;
      password: string;
      fullName: string;
      phone?: string;
    };
    const result = await authService.registerPatient(
      body,
      res,
      req.requestId,
    );
    res.status(201).json(result);
  }),
);

authRouter.post(
  "/login",
  redisRateLimit({ prefix: "rl:login", windowSeconds: 900, max: 10 }),
  validate(loginSchema),
  asyncHandler(async (req, res) => {
    const body = req.body as { email: string; password: string };
    const result = await authService.login(body, res, req.requestId);
    res.json(result);
  }),
);

authRouter.post(
  "/refresh",
  validate(refreshSchema),
  asyncHandler(async (req, res) => {
    const fromBody = (req.body as { refreshToken?: string }).refreshToken;
    const fromCookie = req.cookies?.refresh_token as string | undefined;
    const result = await authService.refresh(fromBody ?? fromCookie, res);
    res.json(result);
  }),
);

authRouter.post(
  "/logout",
  validate(refreshSchema),
  asyncHandler(async (req, res) => {
    const fromBody = (req.body as { refreshToken?: string }).refreshToken;
    const fromCookie = req.cookies?.refresh_token as string | undefined;
    await authService.logout(
      fromBody ?? fromCookie,
      res,
      req.user?.id,
      req.requestId,
    );
    res.status(204).send();
  }),
);

authRouter.get(
  "/me",
  authenticate,
  asyncHandler(async (req, res) => {
    const me = await authService.getMe(req.user!.id);
    res.json(me);
  }),
);
