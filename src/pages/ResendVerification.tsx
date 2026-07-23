import AccountEmailRequest from "../components/auth/AccountEmailRequest";

export default function ResendVerification() {
  return (
    <AccountEmailRequest
      title="Resend verification"
      endpoint="/auth/verification/request"
      buttonLabel="Send verification link"
      developmentTokenKey="developmentVerificationToken"
      developmentPath="/verify-email"
    />
  );
}
