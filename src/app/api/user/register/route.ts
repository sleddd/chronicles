import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { createUserSchema } from '@/lib/db/schemaManager';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import crypto from 'crypto';
import { checkRateLimit, RATE_LIMITS } from '@/lib/rateLimit';

const registerSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z
    .string()
    .min(12, 'Password must be at least 12 characters')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number'),
});

// Email whitelist - comma-separated list from environment variable
function isEmailWhitelisted(email: string): boolean {
  const whitelist = process.env.REGISTRATION_WHITELIST;
  if (!whitelist) {
    return false;
  }

  const allowedEmails = whitelist.split(',').map((e) => e.trim().toLowerCase());
  return allowedEmails.includes(email.toLowerCase());
}

export async function POST(request: NextRequest) {
  // Rate limiting by IP
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown';
  const rateLimit = checkRateLimit(`register:${ip}`, RATE_LIMITS.register);

  if (!rateLimit.success) {
    return NextResponse.json(
      { error: 'Too many registration attempts. Please try again later.' },
      {
        status: 429,
        headers: {
          'Retry-After': Math.ceil((rateLimit.resetAt - Date.now()) / 1000).toString(),
        },
      }
    );
  }

  try {
    const body = await request.json();

    // Validate input
    const validatedData = registerSchema.parse(body);

    // Check if email is whitelisted
    if (!isEmailWhitelisted(validatedData.email)) {
      return NextResponse.json(
        { error: 'Registration is currently by invitation only' },
        { status: 403 }
      );
    }

    // Check if user exists
    const existingUser = await prisma.account.findUnique({
      where: { email: validatedData.email },
    });

    if (existingUser) {
      return NextResponse.json(
        { error: 'User with this email already exists' },
        { status: 400 }
      );
    }

    // Hash password with bcrypt
    const passwordHash = await bcrypt.hash(validatedData.password, 10);

    // Generate random salt for encryption (32 bytes)
    const salt = crypto.randomBytes(32).toString('base64');

    // Create user-specific schema first
    const schemaName = await createUserSchema();

    // Create account in auth.accounts
    const account = await prisma.account.create({
      data: {
        email: validatedData.email,
        passwordHash,
        salt,
        schemaName,
      },
    });

    return NextResponse.json(
      {
        message: 'User created successfully',
        userId: account.id,
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation failed', details: error.issues },
        { status: 400 }
      );
    }

    console.error('Registration error:', error);
    return NextResponse.json(
      { error: 'An error occurred during registration' },
      { status: 500 }
    );
  }
}
