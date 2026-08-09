import { NextResponse } from 'next/server';
import { getAdminAuth } from '@/firebase/admin';
import nodemailer from 'nodemailer';
import { transformFirebaseAuthActionLink } from '@/lib/firebase-auth-action-link';

const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 465,
  secure: true, // Use SSL/TLS
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS, // The 16-letter App Password
  },
});

export async function POST(request: Request) {
  try {
    const { email } = await request.json();

    if (!email) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    }

    if (!process.env.SMTP_USER || !process.env.SMTP_PASS || process.env.SMTP_PASS === 'YOUR_16_LETTER_APP_PASSWORD_HERE') {
      console.error('SMTP credentials are not configured properly.');
      return NextResponse.json({ error: 'Server email configuration is incomplete' }, { status: 500 });
    }

    // 1. Generate the verification link using Firebase Admin SDK
    // This securely generates a link for the requested email using the Identity Toolkit API.
    const actionCodeSettings = {
      // The continue URL after verification
      url: 'https://katuwangsolutions.com/dashboard',
      handleCodeInApp: false,
    };
    
    const firebaseLink = await getAdminAuth().generateEmailVerificationLink(email, actionCodeSettings);
    
    // 1.5 Transform URL to use canonical domain and path: https://katuwangsolutions.com/auth/action
    const verificationLink = transformFirebaseAuthActionLink(firebaseLink);

    // 2. Construct the beautifully branded HTML email
    const htmlContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eaeaea; border-radius: 10px; background-color: #ffffff;">
        <div style="text-align: center; margin-bottom: 20px;">
          <h1 style="color: #0f172a; margin: 0; font-size: 24px;">Katuwang Solutions</h1>
          <p style="color: #64748b; font-size: 14px; margin-top: 5px;">Ang Katuwang mo sa Negosyo</p>
        </div>
        
        <div style="padding: 20px; background-color: #f8fafc; border-radius: 8px;">
          <h2 style="color: #334155; font-size: 18px; margin-top: 0;">Verify your email address</h2>
          <p style="color: #475569; font-size: 15px; line-height: 1.5;">
            Hello,<br><br>
            I-verify ang iyong email address para makatulong na maprotektahan ang iyong Katuwang account.
          </p>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="${verificationLink}" style="background-color: #020617; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 15px; display: inline-block;">
              Verify Email Address
            </a>
          </div>
          
          <p style="color: #64748b; font-size: 13px; line-height: 1.5; margin-bottom: 0;">
            If you didn't ask to verify this address, you can ignore this email.
            <br><br>
            If the button doesn't work, copy and paste this link into your browser:<br>
            <a href="${verificationLink}" style="color: #2563eb; word-break: break-all;">${verificationLink}</a>
          </p>
        </div>
        
        <div style="text-align: center; margin-top: 20px; color: #94a3b8; font-size: 12px;">
          &copy; ${new Date().getFullYear()} Katuwang Solutions. All rights reserved.
        </div>
      </div>
    `;

    // 3. Send the email using Nodemailer
    const mailOptions = {
      from: '"Katuwang Solutions" <' + process.env.SMTP_USER + '>',
      to: email,
      subject: 'Verify your email for Katuwang Solutions',
      html: htmlContent,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('Verification email sent successfully:', info.messageId);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error in send-verification route:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to send verification email' },
      { status: 500 }
    );
  }
}
