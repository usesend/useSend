import { z } from "zod";

/**
 * Password validation schema with strong requirements:
 * - Minimum 8 characters
 * - Maximum 128 characters
 * - At least one lowercase letter
 * - At least one uppercase letter
 * - At least one number
 */
export const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(128, "Password must be less than 128 characters")
  .regex(/[a-z]/, "Password must contain at least one lowercase letter")
  .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
  .regex(/[0-9]/, "Password must contain at least one number");

/**
 * Validates a password against the password schema
 * @param password - The password to validate
 * @returns SafeParseReturnType with success status and error messages
 */
export const validatePassword = (password: string) => {
  return passwordSchema.safeParse(password);
};

/**
 * Schema for signup form validation
 */
export const signupSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: passwordSchema,
  name: z.string().min(1, "Name is required").optional(),
});

/**
 * Schema for password login form validation
 */
export const passwordLoginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

/**
 * Schema for password change (when user already has a password)
 */
export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
  newPassword: passwordSchema,
});

/**
 * Schema for setting password (when OAuth user adds password)
 */
export const setPasswordSchema = z.object({
  newPassword: passwordSchema,
});

/**
 * Schema for password reset
 */
export const resetPasswordSchema = z.object({
  token: z.string().min(1, "Reset token is required"),
  password: passwordSchema,
});
