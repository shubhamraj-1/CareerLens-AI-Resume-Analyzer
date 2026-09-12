import { randomBytes } from "node:crypto";
import prisma from "../config/database";
import { hashPassword, comparePassword } from "../helpers/password";
import { generateToken } from "../helpers/jwt";
import type { RegisterBody, LoginBody } from "../types";

export class AuthService {
  async register(data: RegisterBody) {
    const existingUser = await prisma.user.findUnique({
      where: { email: data.email },
    });

    if (existingUser) {
      throw new Error("Email already registered");
    }

    const hashedPassword = await hashPassword(data.password);

    const user = await prisma.user.create({
      data: {
        name: data.name,
        email: data.email,
        password: hashedPassword,
        role: data.role === "other" && data.customRole ? data.customRole : data.role,
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isPro: true,
        aiCredits: true,
        createdAt: true,
      },
    });

    const token = generateToken({ userId: user.id, email: user.email });

    return { user, token };
  }

  async login(data: LoginBody) {
    const user = await prisma.user.findUnique({
      where: { email: data.email },
    });

    if (!user) {
      throw new Error("Invalid email or password");
    }

    const isValidPassword = await comparePassword(data.password, user.password);
    if (!isValidPassword) {
      throw new Error("Invalid email or password");
    }

    const token = generateToken({ userId: user.id, email: user.email });

    return {
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        isPro: user.isPro,
        aiCredits: user.aiCredits,
        createdAt: user.createdAt,
      },
      token,
    };
  }

  async getProfile(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isPro: true,
        aiCredits: true,
        createdAt: true,
      },
    });

    if (!user) {
      throw new Error("User not found");
    }

    return user;
  }
  async googleAuth(data: { email: string; name: string; picture: string }) {
    // Check if user exists
    let user = await prisma.user.findUnique({
      where: { email: data.email },
      select: { id: true, name: true, email: true, role: true, isPro: true, aiCredits: true, createdAt: true },
    });

    if (!user) {
      // Unusable random password (Google-only; bcrypt requires a valid hash, not an empty string)
      const randomSecret = randomBytes(32).toString("hex");
      const oauthOnlyPassword = await hashPassword(randomSecret);
      user = await prisma.user.create({
        data: {
          name: data.name,
          email: data.email,
          password: oauthOnlyPassword,
          role: "fresher",
          isPro: false,
          aiCredits: 1,
        },
        select: { id: true, name: true, email: true, role: true, isPro: true, aiCredits: true, createdAt: true },
      });
    }

    const token = generateToken({ userId: user.id, email: user.email });

    return { user, token };
  }
}

export const authService = new AuthService();
