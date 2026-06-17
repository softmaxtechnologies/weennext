// app/api/send-mail/route.js
import { NextResponse } from 'next/server';
import nodemailer from 'nodemailer';

// Email transporter
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

export async function POST(request) {
  try {
    const { to, subject, body, isHtml } = await request.json();

    // Validate required fields
    if (!to || !subject || !body) {
      return NextResponse.json(
        { error: 'Missing required fields: to, subject, body' },
        { status: 400 }
      );
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const emails = Array.isArray(to) ? to : [to];
    const invalidEmails = emails.filter(email => !emailRegex.test(email));
    
    if (invalidEmails.length > 0) {
      return NextResponse.json(
        { error: `Invalid email(s): ${invalidEmails.join(', ')}` },
        { status: 400 }
      );
    }

    // Send email
    const mailOptions = {
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to: emails.join(', '),
      subject: subject,
      html: isHtml ? body : body.replace(/\n/g, '<br>'),
      text: isHtml ? body.replace(/<[^>]*>/g, '') : body,
    };

    const info = await transporter.sendMail(mailOptions);

    return NextResponse.json({
      success: true,
      message: `Email sent to ${emails.length} recipient(s)`,
      messageId: info.messageId,
    });

  } catch (error) {
    console.error('Email send error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to send email' },
      { status: 500 }
    );
  }
}

// GET endpoint to check API status
export async function GET() {
  return NextResponse.json({
    status: 'OK',
    message: 'Email API is running',
    usage: {
      method: 'POST',
      body: {
        to: 'email@example.com or ["email1@example.com", "email2@example.com"]',
        subject: 'Email Subject',
        body: 'Email Body (plain text or HTML)',
        isHtml: true // optional, default false
      }
    }
  });
}