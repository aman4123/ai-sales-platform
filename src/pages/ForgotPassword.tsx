import AccountEmailRequest from "../components/auth/AccountEmailRequest";

export default function ForgotPassword() {
  return (
    <AccountEmailRequest
      title="Reset password"
      endpoint="/auth/password-reset/request"
      buttonLabel="Send reset link"
      developmentTokenKey="developmentResetToken"
      developmentPath="/reset-password"
    />
  );
}
