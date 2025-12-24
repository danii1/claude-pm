/**
 * Jira API integration
 */

import type { Config } from './config';
import { JiraFormatter } from './jira-formatter';

export interface JiraStory {
  key: string;
  url: string;
  id: string;
}

export interface JiraTask {
  key: string;
  url: string;
}

export interface JiraIssueDetails {
  key: string;
  summary: string;
  description: string;
  issueType: string;
  status: string;
  url: string;
}

export class JiraClient {
  private baseUrl: string;
  private auth: string;
  private config: Config['jira'];

  constructor(config: Config['jira']) {
    this.config = config;
    this.baseUrl = `https://${config.domain}/rest/api/3`;
    this.auth = Buffer.from(`${config.email}:${config.apiToken}`).toString('base64');
  }

  private async request<T>(
    endpoint: string,
    method: string = 'GET',
    body?: unknown
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    const headers = {
      'Authorization': `Basic ${this.auth}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    };

    const response = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Jira API error (${response.status}): ${errorText}`
      );
    }

    return response.json() as T;
  }

  async createStory(summary: string, description: string, issueType: string = 'Story'): Promise<JiraStory> {
    // Convert description to ADF format
    const descriptionADF = JiraFormatter.textToADF(description);

    const issueData = {
      fields: {
        project: {
          key: this.config.projectKey,
        },
        summary,
        description: descriptionADF,
        issuetype: {
          name: issueType,
        },
      },
    };

    const result = await this.request<{ key: string; id: string }>(
      '/issue',
      'POST',
      issueData
    );

    return {
      key: result.key,
      id: result.id,
      url: `https://${this.config.domain}/browse/${result.key}`,
    };
  }

  async createSubtask(
    parentKey: string,
    summary: string,
    description?: string
  ): Promise<JiraTask> {
    // Convert description to ADF format if provided
    const descriptionADF = description
      ? JiraFormatter.textToADF(description)
      : undefined;

    const issueData = {
      fields: {
        project: {
          key: this.config.projectKey,
        },
        parent: {
          key: parentKey,
        },
        summary,
        description: descriptionADF,
        issuetype: {
          name: 'Subtask',
        },
      },
    };

    const result = await this.request<{ key: string }>(
      '/issue',
      'POST',
      issueData
    );

    return {
      key: result.key,
      url: `https://${this.config.domain}/browse/${result.key}`,
    };
  }

  async linkIssues(
    inwardIssue: string,
    outwardIssue: string,
    linkType: string = 'Relates'
  ): Promise<void> {
    await this.request('/issueLink', 'POST', {
      type: {
        name: linkType,
      },
      inwardIssue: {
        key: inwardIssue,
      },
      outwardIssue: {
        key: outwardIssue,
      },
    });
  }

  async linkToEpic(storyKey: string, epicKey: string): Promise<void> {
    // In Jira API v3, you link to an epic by setting the parent field
    await this.request(
      `/issue/${storyKey}`,
      'PUT',
      {
        fields: {
          parent: {
            key: epicKey,
          },
        },
      }
    );
  }

  async getIssue(issueKey: string): Promise<JiraIssueDetails> {
    const result = await this.request<any>(
      `/issue/${issueKey}?fields=summary,description,issuetype,status`
    );

    // Extract text from Jira's ADF (Atlassian Document Format) description
    const extractText = (content: any): string => {
      if (!content) return '';
      if (typeof content === 'string') return content;
      if (Array.isArray(content)) {
        return content.map(extractText).join(' ');
      }
      if (content.type === 'text') {
        return content.text || '';
      }
      if (content.content) {
        return extractText(content.content);
      }
      return '';
    };

    const description = result.fields.description
      ? extractText(result.fields.description)
      : '';

    return {
      key: result.key,
      summary: result.fields.summary,
      description,
      issueType: result.fields.issuetype.name,
      status: result.fields.status.name,
      url: `https://${this.config.domain}/browse/${result.key}`,
    };
  }
}
