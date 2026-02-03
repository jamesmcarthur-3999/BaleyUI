/**
 * Notification Service
 *
 * Implements notification creation for the send_notification built-in tool.
 * Notifications are stored in the database and can be retrieved by the UI.
 */

import { db, notifications } from '@baleyui/db';
import type { BuiltInToolContext } from '../tools/built-in';

// ============================================================================
// TYPES
// ============================================================================

export interface NotificationInput {
  title: string;
  message: string;
  priority: string;
}

export interface NotificationResult {
  sent: boolean;
  notification_id: string;
}

export type NotificationSender = (
  notification: NotificationInput,
  ctx: BuiltInToolContext
) => Promise<NotificationResult>;

// ============================================================================
// IMPLEMENTATION
// ============================================================================

/**
 * Send a notification (creates a record in the database)
 */
async function sendNotification(
  notification: NotificationInput,
  ctx: BuiltInToolContext
): Promise<NotificationResult> {
  // Validate priority
  const validPriorities = ['low', 'normal', 'high'];
  const priority = validPriorities.includes(notification.priority)
    ? notification.priority
    : 'normal';

  // Get the user to notify (from execution context)
  // For now, we notify the user who owns the execution
  // In the future, this could be configurable per BB
  const userId = ctx.userId ?? 'system';

  // Create notification record
  const results = await db
    .insert(notifications)
    .values({
      workspaceId: ctx.workspaceId,
      userId,
      title: notification.title,
      message: notification.message,
      priority,
      sourceType: 'baleybot',
      sourceId: ctx.baleybotId,
      executionId: ctx.executionId,
    })
    .returning({ id: notifications.id });

  const result = results[0];
  if (!result?.id) {
    throw new Error('Failed to create notification');
  }

  return {
    sent: true,
    notification_id: result.id,
  };
}

// ============================================================================
// EXPORT SERVICE
// ============================================================================

/**
 * Create the notification sender function
 */
export function createNotificationSender(): NotificationSender {
  return sendNotification;
}

/**
 * Default notification sender instance
 */
export const notificationSender = createNotificationSender();
