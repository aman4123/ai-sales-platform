export async function askMockAI(prompt: string): Promise<string> {
  await new Promise((resolve) => setTimeout(resolve, 1000));

  return `
AI Sales Analysis

Prompt:
${prompt}

Company: Example Technologies Pvt Ltd

Industry:
Software Development

Employees:
250+

Pain Points:
• Low outbound response rate
• Manual lead research
• No CRM automation

Recommendations:
• Use LinkedIn outreach
• Automate follow-up emails
• Integrate CRM with AI
• Score leads automatically

Confidence Score:
94%
`;
}