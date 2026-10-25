/**
 * Genuine AWS-signed SNS messages, captured from real SNS deliveries and
 * published as test fixtures by AWS and django-ses:
 * - https://github.com/aws/aws-php-sns-message-validator/blob/master/tests/FunctionalValidationsTest.php
 * - https://github.com/aws/aws-sdk-ruby/blob/version-3/gems/aws-sdk-sns/spec/message_verifier_spec.rb
 * - https://github.com/django-ses/django-ses/blob/main/tests/test_verifier.py
 * All of them are signed by the certificate below (CN=sns.amazonaws.com), which
 * AWS no longer serves, so tests stub the certificate fetch with it.
 */

export const AWS_SNS_SIGNING_CERT = `-----BEGIN CERTIFICATE-----
MIIF1zCCBL+gAwIBAgIQB9pYWG3Mi7xej22g9pobJTANBgkqhkiG9w0BAQsFADBG
MQswCQYDVQQGEwJVUzEPMA0GA1UEChMGQW1hem9uMRUwEwYDVQQLEwxTZXJ2ZXIg
Q0EgMUIxDzANBgNVBAMTBkFtYXpvbjAeFw0yMTA5MDcwMDAwMDBaFw0yMjA4MTcy
MzU5NTlaMBwxGjAYBgNVBAMTEXNucy5hbWF6b25hd3MuY29tMIIBIjANBgkqhkiG
9w0BAQEFAAOCAQ8AMIIBCgKCAQEAutFqueT3XgP13udzxE6UpbdjOtVO5DwoMpSM
iDNMnGzF1TYH5/R2LPUOBeTB0SkKnR4kpNcUZhicpGD4aKciz/GEZ6wu65xncfT9
H/KBOQwoXYTuClHwp6fYpGzcGFaFoEYMnijL/o4qmTSd+ukglQUgKpsDw4ofw6rU
m2CttJo+GQSNQ9NfGR1h/0J+zsApkeSYrXRx5wNlu87z8os1C/6PBrUHwt3xXeaf
Xzfwut8aRRYsS8BySOA9DAgLfNHlfdQCjKPXKrG/ussgReyWD6n/HH+j7Uha3xos
TzQqJifcxlTq6MxWdPR6fDaJNvqw6DOE7UjUNxHguXHlVfxhlQIDAQABo4IC6TCC
AuUwHwYDVR0jBBgwFoAUWaRmBlKge5WSPKOUByeWdFv5PdAwHQYDVR0OBBYEFAqz
C+vyouneE7mWWLbi9i0UsWUbMBwGA1UdEQQVMBOCEXNucy5hbWF6b25hd3MuY29t
MA4GA1UdDwEB/wQEAwIFoDAdBgNVHSUEFjAUBggrBgEFBQcDAQYIKwYBBQUHAwIw
OwYDVR0fBDQwMjAwoC6gLIYqaHR0cDovL2NybC5zY2ExYi5hbWF6b250cnVzdC5j
b20vc2NhMWIuY3JsMBMGA1UdIAQMMAowCAYGZ4EMAQIBMHUGCCsGAQUFBwEBBGkw
ZzAtBggrBgEFBQcwAYYhaHR0cDovL29jc3Auc2NhMWIuYW1hem9udHJ1c3QuY29t
MDYGCCsGAQUFBzAChipodHRwOi8vY3J0LnNjYTFiLmFtYXpvbnRydXN0LmNvbS9z
Y2ExYi5jcnQwDAYDVR0TAQH/BAIwADCCAX0GCisGAQQB1nkCBAIEggFtBIIBaQFn
AHYAKXm+8J45OSHwVnOfY6V35b5XfZxgCvj5TV0mXCVdx4QAAAF7vfDVkQAABAMA
RzBFAiEA2XfHuy36aqRFiaL8c3md2mH451go8707+fRE0pEdSRACIE/g5FXTUXUZ
PFcmOhm9TZ+uMY1i4CIQ/CKVWln6C3t+AHYAUaOw9f0BeZxWbbg3eI8MpHrMGyfL
956IQpoN/tSLBeUAAAF7vfDVjAAABAMARzBFAiBF1MhhFP0+FQt3daDFfMYoWwnr
muTInrjNpwfzlvQBugIhAPYadFzr+LaxSJoiZEbEHBvTts7bT0M3eCQONA2O7w6n
AHUAQcjKsd8iRkoQxqE6CUKHXk4xixsD6+tLx2jwkGKWBvYAAAF7vfDVdAAABAMA
RjBEAiAtPapmFAuA71ih4NoSd5hJelzAltNQpxDMcDfDyHyU8gIgWxmaa6+2KbBu
9xdv379zvnJACFR7jc+4asl08Dn4aagwDQYJKoZIhvcNAQELBQADggEBAA54QX0u
oFWXfMmv02CGZv4NWo5TapyeeixQ2kKpZHRdVZjxZrw+hoF6HD7P3kGjH8ztyJll
tDxB0qgMltbPhQdScwhA6iTgoaBYqEUC/VHKd4PmmPT6yIsM36NBZVmkGlzl5uNo
/dBgBaG0SsVJnhr5zro3c2quC7n6fVGEZhf/UgQwRnnvThnvbNKguglDMq4uEqv8
njKyleht+glkcmXO0m9qLKt6BOS0amy6U2GlAwRn0Wx02ndJtnRCSC6kPuRWK/SQ
FEjB7gCK4hdKaAOuWdZpI55vF6ifOeM8toC3g7ofO8qLTnJupAG+ZitY5J3cvHWr
HqOUdKigPDHYLRo=
-----END CERTIFICATE-----
`;

export const AWS_SIGNED_SNS_MESSAGES = {
  sha1: {
    Type: "Notification",
    MessageId: "792cda85-518f-5dd3-9163-81d851212f3a",
    TopicArn:
      "arn:aws:sns:us-east-2:295079676684:publish-and-verify-892f85fe-4836-424d-8188-ab85bef0f362",
    Message: "Hello world",
    Timestamp: "2022-07-28T21:23:58.317Z",
    SignatureVersion: "1",
    Signature:
      "ghtf+deOBAzHJJZ6s6CdRLfTQAlcGzq9naoFM1wi0CJiq//uVRuZnamrkWNF0fhouMFvuLVRwcz8PZLUMSfnmd5VpdTKpTyiKmy1qJAZXma0w+yi7G+I33hD1Jyk1Nbym2n0kqp3fVu2aoooiN2ZeLAT2bH0/BtjLSfN1yAOKNoprco4qV9gGUZinXJdj9a1YdNhDR2jKi33ldlsVtEXAtiaDklGEk7DgRKX38GerBPiLg3FdtgY6KC7cdeGpU/dGK+4hjc83Ive1HoFkAwqhpgInM2sMytBosoiXfCmOKmU4xeGD0gHDNZTlJUJQDlzw8Eag0H9f/5zXF9d3uy0YQ==",
    SigningCertURL:
      "https://sns.us-east-2.amazonaws.com/SimpleNotificationService-7ff5318490ec183fbaddaa2a969abfda.pem",
    UnsubscribeURL:
      "https://sns.us-east-2.amazonaws.com/?Action=Unsubscribe&SubscriptionArn=arn:aws:sns:us-east-2:295079676684:publish-and-verify-892f85fe-4836-424d-8188-ab85bef0f362:2296bc94-7992-4be1-b15f-b97229b5c1d8",
  },
  sha256: {
    Type: "Notification",
    MessageId: "17dea24b-55c2-540b-8362-f916557af765",
    TopicArn:
      "arn:aws:sns:us-east-2:295079676684:publish-and-verify-62674b1d-4295-426b-88e7-5fb75652a04e",
    Message: "Hello world",
    Timestamp: "2022-07-28T21:24:08.324Z",
    SignatureVersion: "2",
    Signature:
      "CXVqp9PfZAL+4JHS3Zxo1PFbQsvnOjvmYhtIf17TWpwc+iIVas8kZ8GopuzVzVMdatE7rCl/O4P91Zp05Dwz8lk8dLhfp8gSu3Njlzxlyrmzo9x3va3Jb7zFnedgS2GKnZWHGBdwTXho+TosNUE+3e10OMSlwN5XGDwX7+R3WL+rn+AXmFAqp3alg27sYa55h1dLE9cGszGPjScPdtF3BmZsUDMx9wSdNKsCk+vSvE8yBjnCmUl7laSFj3LzPVrlSwgNYCF3kYnNAkah7NplK4SFhJYLwS0HCVCQJKa8rVbQLf9cBTu60U402mrgy0bN8xWoyimzbYbrOMJjalqkUg==",
    SigningCertURL:
      "https://sns.us-east-2.amazonaws.com/SimpleNotificationService-7ff5318490ec183fbaddaa2a969abfda.pem",
    UnsubscribeURL:
      "https://sns.us-east-2.amazonaws.com/?Action=Unsubscribe&SubscriptionArn=arn:aws:sns:us-east-2:295079676684:publish-and-verify-62674b1d-4295-426b-88e7-5fb75652a04e:ad7d16e3-0a7c-46aa-b23e-ffaf02250cbe",
  },
  sha1WithSubject: {
    Type: "Notification",
    MessageId: "11405cc3-9ac7-56d5-b45d-079e8f7a8edf",
    TopicArn:
      "arn:aws:sns:us-east-2:295079676684:publish-and-verify-6e11fed2-fcdf-4c52-9dc4-36ef43f37f84",
    Subject: "Hello world",
    Message: "Hello world",
    Timestamp: "2022-07-28T22:53:49.654Z",
    SignatureVersion: "1",
    Signature:
      "AItkS26d8yvnIKJevdirIPW7eM/yKbZy3/CF2EreCHmXWB3etWaV5Fb7SYpGABMpugpDZzNyGY1wCVWaopDoQ+7Q/kI2TpDu8bw1eExbi8U3kduvc/2m2fIrI4gDEY8/v3nzoLcr8pPodqMzrX6SzQou4klfaqbNK+rFmH0LVf2Q1VyOROODoSXmo4jg2Yu12jfxccBl96Drr/ihq4MJ4OcrWh6UzXXlVYjJHx2Ui4anNwNEb+Z4C2CAF1DjQUbhDtaoajDBPY+4d9C1OwbqwQpXsd6tyVcI9nFyEsVK8lfnAV+/3GZQcdXHbIUYBRGcBa4X5TlWJku5nDH2ERtHHw==",
    SigningCertURL:
      "https://sns.us-east-2.amazonaws.com/SimpleNotificationService-7ff5318490ec183fbaddaa2a969abfda.pem",
    UnsubscribeURL:
      "https://sns.us-east-2.amazonaws.com/?Action=Unsubscribe&SubscriptionArn=arn:aws:sns:us-east-2:295079676684:publish-and-verify-6e11fed2-fcdf-4c52-9dc4-36ef43f37f84:adb318c3-2234-4c56-905d-c324cf0df874",
  },
  sha256WithSubject: {
    Type: "Notification",
    MessageId: "4504e649-d933-5aa9-8199-bd14ccf05f0b",
    TopicArn:
      "arn:aws:sns:us-east-2:295079676684:publish-and-verify-530b26da-0687-4fe4-9f71-780bad3181e2",
    Subject: "Hello world",
    Message: "Hello world",
    Timestamp: "2022-07-28T22:53:55.086Z",
    SignatureVersion: "2",
    Signature:
      "cETcSvmmkt+My05qCLKexyl0+RyG83mSryKPqTfS+tYcxDJWVcjPJAr+qdpElzVaBl1aTGYVWMY64i9JqZ/JES8pylNj8LGvdhuNQKO59/WCoIimZAsNhn0xEgOeeDU+W/0BU4sdpCGMNjo0S/FuIiWaRe4E0YWRVrxeQevaQ70euDdfWgd5v1eCKQz8b367b9XBmMztL/CWUFI6YaKK/MV21eyvJe3Y7CtVYiOKEYiAZnAEkynK7gUGO5TsgDjGNYhj6U3xYsWgI03bmioSl7kdFSUj+AZ7ugas5fghqxgoDsdfqsjMYKRm5KKHQWsgzI619yIzpNKUiSMHxdZXpQ==",
    SigningCertURL:
      "https://sns.us-east-2.amazonaws.com/SimpleNotificationService-7ff5318490ec183fbaddaa2a969abfda.pem",
    UnsubscribeURL:
      "https://sns.us-east-2.amazonaws.com/?Action=Unsubscribe&SubscriptionArn=arn:aws:sns:us-east-2:295079676684:publish-and-verify-530b26da-0687-4fe4-9f71-780bad3181e2:db0ad2ad-03d1-48ca-a5da-51f317800a57",
  },
  sesComplaintEventWithSubject: {
    Type: "Notification",
    MessageId: "97903a0c-8818-5442-94b2-60b0c63d3da0",
    TopicArn: "arn:aws:sns:us-east-1:364852123998:test-email",
    Subject: "Amazon SES Email Event Notification",
    Message:
      '{"eventType":"Complaint","complaint":{"feedbackId":"0100017fd2f87864-7f070191-4eb1-49e3-a42e-7e996b718724-000000","complaintSubType":null,"complainedRecipients":[{"emailAddress":"complaint@simulator.amazonses.com"}],"timestamp":"2022-03-28T23:59:33.564Z","userAgent":"Amazon SES Mailbox Simulator","complaintFeedbackType":"abuse","arrivalDate":"2022-03-28T23:59:33.564Z"},"mail":{"timestamp":"2022-03-28T23:59:32.804Z","source":"jesus.islasf@alumno.buap.mx","sourceArn":"arn:aws:ses:us-east-1:364852123998:identity/jesus.islasf@alumno.buap.mx","sendingAccountId":"364852123998","messageId":"0100017fd2f875c4-c2929163-2767-49b1-8513-1a29e428e134-000000","destination":["complaint@simulator.amazonses.com"],"headersTruncated":false,"headers":[{"name":"From","value":"jesus.islasf@alumno.buap.mx"},{"name":"To","value":"complaint@simulator.amazonses.com"},{"name":"Subject","value":"Complaint Notification"},{"name":"MIME-Version","value":"1.0"},{"name":"Content-Type","value":"multipart/alternative;  boundary=\\"----=_Part_1160373_1543555432.1648511972808\\""}],"commonHeaders":{"from":["jesus.islasf@alumno.buap.mx"],"to":["complaint@simulator.amazonses.com"],"messageId":"0100017fd2f875c4-c2929163-2767-49b1-8513-1a29e428e134-000000","subject":"Complaint Notification"},"tags":{"ses:operation":["SendEmail"],"ses:configuration-set":["test-set"],"ses:source-ip":["189.203.131.80"],"ses:from-domain":["alumno.buap.mx"],"ses:caller-identity":["root"]}}}\n',
    Timestamp: "2022-03-28T23:59:33.713Z",
    SignatureVersion: "1",
    Signature:
      "MAnUSvI5C6S0GERh05oFiMtpZuGTW0J/6I/AaBinsZWK+Na8TwJsiNSUjShgZ8NItzQkjBnY1R1qT0wtPf6FfNXxGu3oQRaYsj1alz5NJyiuZwGlryX9LHuOoSJ7tGhrKA5yfYI1JPZsdUJKnkI3+UgKbIg7ml2FoSMU8s3HP3V/FOhvp6V5P6yt2okxABbw13WQPrzeUCZ9pRLgB3TnY59wsWM2SlynWEG/u/pFHyzuvkmtrGZtjZfITm7bfMnGy8FTOox4PfzCu4bysKlUbhc/yJ0fzI/+XsT2gKasXETzlmx6vd4qKgKWP5U9OJVh+Cx//npFDCBI2Tba8JK+Cg==",
    SigningCertURL:
      "https://sns.us-east-1.amazonaws.com/SimpleNotificationService-7ff5318490ec183fbaddaa2a969abfda.pem",
    UnsubscribeURL:
      "https://sns.us-east-1.amazonaws.com/?Action=Unsubscribe&SubscriptionArn=arn:aws:sns:us-east-1:364852123998:test-email:0fe0bffc-6470-4502-9414-d5e3d9fdd71e",
  },
  sesBounceNotificationWithoutSubject: {
    Type: "Notification",
    MessageId: "71a6b82e-0f1a-58db-b902-e2ef60f87541",
    TopicArn: "arn:aws:sns:us-east-1:364852123998:test-email",
    Message:
      '{"notificationType":"Bounce","bounce":{"feedbackId":"0100017fe7044080-b95aeb18-3fb8-408a-be9b-15fdbac3945a-000000","bounceType":"Permanent","bounceSubType":"General","bouncedRecipients":[{"emailAddress":"bounce@simulator.amazonses.com","action":"failed","status":"5.1.1","diagnosticCode":"smtp; 550 5.1.1 user unknown"}],"timestamp":"2022-04-01T21:24:49.000Z","remoteMtaIp":"3.231.136.178","reportingMTA":"dns; a48-30.smtp-out.amazonses.com"},"mail":{"timestamp":"2022-04-01T21:24:49.422Z","source":"jesus.islasf@alumno.buap.mx","sourceArn":"arn:aws:ses:us-east-1:364852123998:identity/jesus.islasf@alumno.buap.mx","sourceIp":"189.203.131.80","sendingAccountId":"364852123998","messageId":"0100017fe7043e8e-fc9c357d-a9a4-49bc-a4b4-fa984009d568-000000","destination":["bounce@simulator.amazonses.com"],"headersTruncated":false,"headers":[{"name":"From","value":"jesus.islasf@alumno.buap.mx"},{"name":"To","value":"bounce@simulator.amazonses.com"},{"name":"Subject","value":"Subject Test"},{"name":"MIME-Version","value":"1.0"},{"name":"Content-Type","value":"multipart/alternative;  boundary=\\"----=_Part_2196631_1474166380.1648848289426\\""}],"commonHeaders":{"from":["jesus.islasf@alumno.buap.mx"],"to":["bounce@simulator.amazonses.com"],"subject":"Subject Test"}}}',
    Timestamp: "2022-04-01T21:24:50.200Z",
    SignatureVersion: "1",
    Signature:
      "K27nwTcT0qTPKEQP3noOWV21gDGB6XnLXSwN2i+4176naErwyDSd72w44UesYE/KaRXU+Kusi7b8uoLYPOcYXHH45UCFMrStf9nzu0uIZdMSd7cFGPm0KAxqoDcP9UQw0+ssK1rjVWkywTYmeDyFF/j3IQZxTA/vINOLYbrmMKhyJUPjcZZwdgLmlKcNfKJ5PKmg5WXlr8nWtjW3K+k725nkoAZemuAFt3PmA2k35JoHphkcOBjV2f1qR9zJTOgrVQ1d6k2v6t8G7Nlg6FP5OiwThgKHkehIPfJfLhTmo05tfPCBzXYMzDbnX+HLidvkyibHlalRl/DuDxXXL7SUiA==",
    SigningCertURL:
      "https://sns.us-east-1.amazonaws.com/SimpleNotificationService-7ff5318490ec183fbaddaa2a969abfda.pem",
    UnsubscribeURL:
      "https://sns.us-east-1.amazonaws.com/?Action=Unsubscribe&SubscriptionArn=arn:aws:sns:us-east-1:364852123998:test-email:0fe0bffc-6470-4502-9414-d5e3d9fdd71e",
  },
};
