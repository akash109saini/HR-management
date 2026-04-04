<?php

namespace App\Services;

use Illuminate\Support\Facades\Log;

class EmailService
{
    public static function send(string $to, string $subject, string $html): bool
    {
        $apiKey = env('RESEND_API_KEY', '');
        $from = env('SENDER_EMAIL', 'onboarding@resend.dev');

        if (!$apiKey || str_contains($apiKey, 'placeholder')) {
            Log::info("Email (not sent - no API key): To={$to}, Subject={$subject}");
            // Store as in-app notification instead
            self::storeAsNotification($to, $subject, strip_tags($html));
            return false;
        }

        $ch = curl_init('https://api.resend.com/emails');
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true, CURLOPT_POST => true, CURLOPT_TIMEOUT => 15,
            CURLOPT_HTTPHEADER => ['Content-Type: application/json', "Authorization: Bearer {$apiKey}"],
            CURLOPT_POSTFIELDS => json_encode([
                'from' => $from, 'to' => [$to], 'subject' => $subject, 'html' => $html,
            ]),
        ]);
        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        if ($httpCode === 200) {
            Log::info("Email sent to {$to}: {$subject}");
            return true;
        }
        Log::error("Email failed ({$httpCode}): {$response}");
        self::storeAsNotification($to, $subject, strip_tags($html));
        return false;
    }

    private static function storeAsNotification(string $toEmail, string $title, string $message): void
    {
        $user = MongoService::findOneNoId('users', ['email' => $toEmail]);
        if ($user) {
            MongoService::insertOne('notifications', [
                'id' => bin2hex(random_bytes(16)),
                'tenant_id' => $user['tenant_id'] ?? '',
                'user_id' => $user['employee_id'] ?? $user['email'],
                'type' => 'email_notification',
                'title' => $title,
                'message' => $message,
                'read' => false,
                'created_at' => now()->toISOString(),
            ]);
        }
    }

    public static function sendLeaveApproval(string $employeeEmail, string $status, string $leaveType, string $dates): void
    {
        $statusLabel = ucfirst($status);
        $html = "<div style='font-family:Arial,sans-serif;max-width:600px;margin:0 auto'>"
            . "<div style='background:#002FA7;padding:20px;text-align:center'><h1 style='color:#fff;margin:0'>HRMS</h1></div>"
            . "<div style='padding:30px;background:#f9fafb;border:1px solid #e5e7eb'>"
            . "<h2 style='color:#1f2937'>Leave Request {$statusLabel}</h2>"
            . "<p>Your <strong>{$leaveType}</strong> leave request for <strong>{$dates}</strong> has been <strong>{$statusLabel}</strong>.</p>"
            . "</div></div>";
        self::send($employeeEmail, "Leave Request {$statusLabel}", $html);
    }

    public static function sendPunchCorrectionUpdate(string $employeeEmail, string $status, string $date): void
    {
        $statusLabel = ucfirst($status);
        $html = "<div style='font-family:Arial,sans-serif;max-width:600px;margin:0 auto'>"
            . "<div style='background:#002FA7;padding:20px;text-align:center'><h1 style='color:#fff;margin:0'>HRMS</h1></div>"
            . "<div style='padding:30px;background:#f9fafb;border:1px solid #e5e7eb'>"
            . "<h2>Punch Correction {$statusLabel}</h2>"
            . "<p>Your punch correction for <strong>{$date}</strong> has been <strong>{$statusLabel}</strong>.</p>"
            . "</div></div>";
        self::send($employeeEmail, "Punch Correction {$statusLabel}", $html);
    }

    public static function sendWelcomeEmail(string $email, string $name, string $employeeId, string $password): void
    {
        $html = "<div style='font-family:Arial,sans-serif;max-width:600px;margin:0 auto'>"
            . "<div style='background:#002FA7;padding:20px;text-align:center'><h1 style='color:#fff;margin:0'>Welcome to HRMS</h1></div>"
            . "<div style='padding:30px;background:#f9fafb;border:1px solid #e5e7eb'>"
            . "<h2>Hello {$name}!</h2>"
            . "<p>Your employee account has been created.</p>"
            . "<p><strong>Employee ID:</strong> {$employeeId}<br>"
            . "<strong>Email:</strong> {$email}<br>"
            . "<strong>Temporary Password:</strong> {$password}</p>"
            . "<p>Please change your password on first login.</p>"
            . "</div></div>";
        self::send($email, "Welcome to HRMS - Your Account Details", $html);
    }
}
