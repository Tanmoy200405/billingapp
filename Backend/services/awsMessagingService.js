import {
  SQSClient,
  SendMessageCommand,
  ReceiveMessageCommand,
  DeleteMessageCommand,
} from "@aws-sdk/client-sqs";
import { SNSClient, PublishCommand } from "@aws-sdk/client-sns";
import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";

let sqsClient = null;
let snsClient = null;
let sesClient = null;

function getAwsRegion() {
  return process.env.AWS_REGION || "ap-south-1";
}

function getClientConfig() {
  const config = { region: getAwsRegion() };
  if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
    config.credentials = {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    };
  }
  return config;
}

export function isSqsConfigured() {
  return Boolean(process.env.AWS_SQS_QUEUE_URL);
}

export function isSnsSmsEnabled() {
  return process.env.AWS_SNS_SMS_ENABLED === "true";
}

export function isSnsTopicConfigured() {
  return Boolean(process.env.AWS_SNS_TOPIC_ARN);
}

export function isSesConfigured() {
  return Boolean(process.env.AWS_SES_FROM_EMAIL);
}

function getSqsClient() {
  if (!sqsClient) sqsClient = new SQSClient(getClientConfig());
  return sqsClient;
}

function getSnsClient() {
  if (!snsClient) snsClient = new SNSClient(getClientConfig());
  return snsClient;
}

function getSesClient() {
  if (!sesClient) sesClient = new SESClient(getClientConfig());
  return sesClient;
}

export function normalizeE164IndianPhone(phone) {
  const digits = (phone || "").toString().replace(/[^0-9]/g, "");
  if (!digits) return "";
  if (digits.length === 10) return `+91${digits}`;
  if (digits.length === 12 && digits.startsWith("91")) return `+${digits}`;
  if (phone.toString().trim().startsWith("+")) return `+${digits}`;
  return `+${digits}`;
}

export async function sendSqsJob(jobType, payload) {
  if (!isSqsConfigured()) {
    return { queued: false, reason: "AWS_SQS_QUEUE_URL not configured" };
  }

  const command = new SendMessageCommand({
    QueueUrl: process.env.AWS_SQS_QUEUE_URL,
    MessageBody: JSON.stringify({
      type: jobType,
      payload,
      enqueuedAt: new Date().toISOString(),
    }),
  });

  const res = await getSqsClient().send(command);
  return { queued: true, messageId: res.MessageId };
}

export async function receiveSqsJobs(maxNumberOfMessages = 10) {
  if (!isSqsConfigured()) return [];

  const command = new ReceiveMessageCommand({
    QueueUrl: process.env.AWS_SQS_QUEUE_URL,
    MaxNumberOfMessages: maxNumberOfMessages,
    WaitTimeSeconds: 20, // Long polling: low latency, near-zero idle requests
    VisibilityTimeout: 60,
  });

  const res = await getSqsClient().send(command);
  return res.Messages || [];
}

export async function deleteSqsJob(receiptHandle) {
  if (!isSqsConfigured() || !receiptHandle) return;
  await getSqsClient().send(
    new DeleteMessageCommand({
      QueueUrl: process.env.AWS_SQS_QUEUE_URL,
      ReceiptHandle: receiptHandle,
    })
  );
}

export async function sendSmsViaSns(phoneNumber, message) {
  if (!isSnsSmsEnabled()) {
    return { sent: false, reason: "AWS_SNS_SMS_ENABLED is not true" };
  }

  const e164Phone = normalizeE164IndianPhone(phoneNumber);
  if (!e164Phone || e164Phone.length < 11) {
    return { sent: false, reason: "Invalid phone number for SMS" };
  }

  const command = new PublishCommand({
    PhoneNumber: e164Phone,
    Message: message,
    MessageAttributes: {
      "AWS.SNS.SMS.SMSType": {
        DataType: "String",
        StringValue: "Transactional",
      },
      ...(process.env.AWS_SNS_SENDER_ID
        ? {
            "AWS.SNS.SMS.SenderID": {
              DataType: "String",
              StringValue: process.env.AWS_SNS_SENDER_ID,
            },
          }
        : {}),
    },
  });

  const res = await getSnsClient().send(command);
  return { sent: true, messageId: res.MessageId };
}

export async function publishSnsEvent(subject, message) {
  if (!isSnsTopicConfigured()) {
    return { published: false, reason: "AWS_SNS_TOPIC_ARN not configured" };
  }

  const command = new PublishCommand({
    TopicArn: process.env.AWS_SNS_TOPIC_ARN,
    Subject: subject.slice(0, 100),
    Message: typeof message === "string" ? message : JSON.stringify(message),
  });

  const res = await getSnsClient().send(command);
  return { published: true, messageId: res.MessageId };
}

export async function sendEmailViaSes({ to, subject, html, text }) {
  if (!isSesConfigured()) {
    return { sent: false, reason: "AWS_SES_FROM_EMAIL not configured" };
  }
  if (!to) {
    return { sent: false, reason: "Recipient email is missing" };
  }

  const command = new SendEmailCommand({
    Source: process.env.AWS_SES_FROM_EMAIL,
    Destination: {
      ToAddresses: Array.isArray(to) ? to : [to],
    },
    Message: {
      Subject: { Data: subject, Charset: "UTF-8" },
      Body: {
        ...(html ? { Html: { Data: html, Charset: "UTF-8" } } : {}),
        ...(text ? { Text: { Data: text, Charset: "UTF-8" } } : {}),
      },
    },
  });

  const res = await getSesClient().send(command);
  return { sent: true, messageId: res.MessageId };
}

export function getAwsMessagingStatus() {
  return {
    region: getAwsRegion(),
    sqsEnabled: isSqsConfigured(),
    snsSmsEnabled: isSnsSmsEnabled(),
    snsTopicEnabled: isSnsTopicConfigured(),
    sesEmailEnabled: isSesConfigured(),
  };
}

