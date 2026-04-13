export const greenhousePublicBoardFixture = {
  jobs: [
    {
      id: 1001,
      title: 'Senior Backend Engineer',
      absolute_url: 'https://boards.greenhouse.io/acmelabs/jobs/1001',
      updated_at: '2026-04-10T12:00:00.000Z',
      location: {
        name: 'Remote - United States',
      },
      content: `
        <p>Acme Labs is hiring for a backend role.</p>
        <h3>Requirements</h3>
        <ul>
          <li>TypeScript</li>
          <li>Node.js</li>
          <li>AWS</li>
        </ul>
        <h3>Preferred</h3>
        <ul>
          <li>Kubernetes</li>
        </ul>
        <p>Compensation: $180,000 - $220,000 per year (USD)</p>
      `,
      metadata: [
        {
          name: 'Employment Type',
          value: 'Full-time',
        },
      ],
    },
    {
      id: 1002,
      title: 'Platform Engineer (Hybrid)',
      absolute_url: 'https://boards.greenhouse.io/acmelabs/jobs/1002',
      updated_at: '2026-04-11T09:30:00.000Z',
      location: {
        name: 'New York, NY (Hybrid)',
      },
      content: `
        <p>Must have Python and Terraform experience.</p>
        <p>Nice to have GCP and Kubernetes.</p>
      `,
      metadata: [
        {
          name: 'Department',
          value: 'Platform',
        },
      ],
    },
    {
      id: '',
      title: '',
      absolute_url: 'not-a-url',
      content: '<p>This payload should fail schema validation.</p>',
    },
  ],
};
