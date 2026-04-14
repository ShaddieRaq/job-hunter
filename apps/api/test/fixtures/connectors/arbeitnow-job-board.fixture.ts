export const arbeitnowJobBoardFixturePageOne = {
  data: [
    {
      slug: 'senior-platform-engineer-remote-1001',
      company_name: 'Acme Labs',
      title: 'Senior Platform Engineer',
      description: `
        <p>Build platform services with TypeScript, Node.js, and AWS.</p>
        <h3>Requirements</h3>
        <ul><li>TypeScript</li><li>Node.js</li><li>AWS</li></ul>
        <h3>Preferred</h3>
        <ul><li>Kubernetes</li></ul>
      `,
      remote: true,
      url: 'https://www.arbeitnow.com/jobs/companies/acme-labs/senior-platform-engineer-remote-1001',
      tags: ['TypeScript', 'Node.js', 'Kubernetes'],
      job_types: ['Full Time'],
      location: 'Berlin',
      created_at: 1712750400,
    },
    {
      slug: 'data-engineer-hybrid-1002',
      company_name: 'Acme Labs',
      title: 'Data Engineer (Hybrid)',
      description: '<p>Must have Python and Terraform. Nice to have GCP.</p>',
      remote: false,
      url: 'https://www.arbeitnow.com/jobs/companies/acme-labs/data-engineer-hybrid-1002',
      tags: ['Python', 'Terraform', 'GCP'],
      job_types: ['Contract'],
      location: 'Munich (Hybrid)',
      created_at: '2026-04-11T09:30:00.000Z',
    },
    {
      slug: '',
      company_name: '',
      title: '',
      url: 'not-a-url',
    },
  ],
  links: {
    next: 'https://www.arbeitnow.com/api/job-board-api?page=2&limit=3',
  },
  meta: {
    current_page: 1,
  },
};

export const arbeitnowJobBoardFixturePageTwo = {
  data: [
    {
      slug: 'backend-engineer-onsite-1003',
      company_name: 'Example Corp',
      title: 'Backend Engineer',
      description: '<p>Go, PostgreSQL, and Docker.</p>',
      remote: false,
      url: 'https://www.arbeitnow.com/jobs/companies/example-corp/backend-engineer-onsite-1003',
      tags: ['Go', 'PostgreSQL', 'Docker'],
      job_types: ['Full Time'],
      location: 'Hamburg On-site',
      created_at: 1712836800,
    },
  ],
  links: {
    next: null,
  },
  meta: {
    current_page: 2,
  },
};
