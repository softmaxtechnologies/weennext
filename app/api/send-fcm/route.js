import { NextResponse } from 'next/server';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';

// Firebase Admin Init
function initFirebase() {
  if (getApps().length > 0) return;

  const serviceAccount = JSON.parse(
    process.env.FIREBASE_SERVICE_ACCOUNT
  );

  initializeApp({
    credential: cert(serviceAccount),
  });
}

export async function POST(request) {
  try {
    initFirebase();

    const body = await request.json();

    const {
      title,
      body: messageBody,
      token,
      tokens,
      data = {}
    } = body;

    if (!title || !messageBody) {
      return NextResponse.json(
        {
          success: false,
          error: 'title and body are required'
        },
        { status: 400 }
      );
    }

    let targetTokens = [];

    if (token) {
      targetTokens.push(token);
    }

    if (Array.isArray(tokens)) {
      targetTokens.push(...tokens);
    }

    targetTokens = [...new Set(targetTokens)];

    if (targetTokens.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: 'No FCM token provided'
        },
        { status: 400 }
      );
    }

    const response = await getMessaging().sendEachForMulticast({
      tokens: targetTokens,

      notification: {
        title,
        body: messageBody,
      },

      data: {
        ...Object.entries(data).reduce((acc, [k, v]) => {
          acc[k] = String(v);
          return acc;
        }, {}),
        click_action: 'FLUTTER_NOTIFICATION_CLICK',
        timestamp: Date.now().toString(),
      },

      android: {
        priority: 'high',
      },

      apns: {
        headers: {
          'apns-priority': '10',
        },
      },
    });

    return NextResponse.json({
      success: true,
      sent: response.successCount,
      failed: response.failureCount,
      total: targetTokens.length,
      responses: response.responses.map(r => ({
        success: r.success,
        error: r.error?.message || null,
      })),
    });

  } catch (error) {
    console.error(error);

    return NextResponse.json(
      {
        success: false,
        error: error.message,
      },
      {
        status: 500,
      }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    status: 'running',
    endpoint: '/api/send-fcm'
  });
}