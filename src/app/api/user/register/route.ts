import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { createUserSchema } from '@/lib/db/schemaManager';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import crypto from 'crypto';

const registerSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z
    .string()
    .min(12, 'Password must be at least 12 characters')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number'),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Validate input
    const validatedData = registerSchema.parse(body);

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
