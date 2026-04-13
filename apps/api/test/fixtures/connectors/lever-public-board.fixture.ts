export const leverPublicBoardFixture = [
  {
    id: 'lever-1001',
    text: 'Senior Platform Engineer',
    hostedUrl: 'https://jobs.lever.co/acmelabs/lever-1001',
    applyUrl: 'https://jobs.lever.co/acmelabs/lever-1001/apply',
    createdAt: 1712750400000,
    workplaceType: 'Remote',
    categories: {
      location: 'Remote - United States',
      commitment: 'Full-time',
      team: 'Platform',
      department: 'Engineering',
    },
    description: `
      <p>Acme Labs is building cloud platform systems.</p>
      <p>Requirements include TypeScript, Node.js, and AWS.</p>
      <p>Compensation range $180,000 - $220,000 per year.</p>
    `,
    lists: [
      {
        text: 'Requirements',
        content: '<ul><li>TypeScript</li><li>Node.js</li><li>AWS</li></ul>',
      },
      {
        text: 'Preferred',
        content: '<ul><li>Kubernetes</li></ul>',
      },
    ],
    additional: '<p>Experience with distributed systems is a plus.</p>',
    salaryRange: {
      min: 180000,
      max: 220000,
      currency: 'USD',
      interval: 'year',
    },
  },
  {
    id: 'lever-1002',
    text: 'Data Engineer (Hybrid)',
    hostedUrl: 'https://jobs.lever.co/acmelabs/lever-1002',
    createdAt: '2026-04-11T09:30:00.000Z',
    categories: {
      location: 'San Francisco, CA (Hybrid)',
      commitment: 'Contract',
      team: 'Data',
      department: 'Engineering',
      allLocations: ['San Francisco, CA (Hybrid)'],
    },
    description: `
      <p>Must have Python, SQL, and Terraform experience.</p>
      <p>Nice to have GCP and Kubernetes.</p>
    `,
    lists: [
      {
        text: 'Must Have',
        content: '<ul><li>Python</li><li>SQL</li><li>Terraform</li></ul>',
      },
      {
        text: 'Nice to Have',
        content: '<ul><li>GCP</li></ul>',
      },
    ],
  },
  {
    id: '',
    text: '',
    hostedUrl: 'not-a-url',
  },
];
