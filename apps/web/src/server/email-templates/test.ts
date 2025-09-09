import { renderOtpEmail, renderTeamInviteEmail } from './index';

async function testEmailTemplates() {
  console.log('Testing email templates...\n');

  try {
    // Test OTP email
    const otpHtml = await renderOtpEmail({
      otpCode: 'ABC123',
      loginUrl: 'https://app.usesend.com/login?token=abc123',
      hostName: 'useSend',
    });
    
    console.log('✅ OTP Email rendered successfully');
    console.log(`Length: ${otpHtml.length} characters\n`);

    // Test Team Invite email
    const inviteHtml = await renderTeamInviteEmail({
      teamName: 'My Awesome Team',
      inviteUrl: 'https://app.usesend.com/join-team?inviteId=123',
    });
    
    console.log('✅ Team Invite Email rendered successfully');
    console.log(`Length: ${inviteHtml.length} characters\n`);

    console.log('🎉 All email templates are working correctly!');
    
  } catch (error) {
    console.error('❌ Error testing email templates:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  testEmailTemplates();
}
