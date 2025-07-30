'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Copy, Check, Database, ExternalLink, AlertTriangle } from 'lucide-react';

export default function SetupPage() {
  const [copiedSteps, setCopiedSteps] = useState<Record<number, boolean>>({});

  const copyToClipboard = async (text: string, stepNumber: number) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedSteps(prev => ({ ...prev, [stepNumber]: true }));
      setTimeout(() => {
        setCopiedSteps(prev => ({ ...prev, [stepNumber]: false }));
      }, 2000);
    } catch (err) {
      console.error('Failed to copy text: ', err);
    }
  };

  const collections = [
    {
      id: 'users',
      name: 'Users',
      description: 'Store user profiles, roles, and leave balances',
      attributes: [
        'firstName (String, required, 100 chars)',
        'lastName (String, required, 100 chars)', 
        'username (String, required, 50 chars)',
        'email (Email, required)',
        'role (String, required, 20 chars)',
        'manager (String, optional, 50 chars)',
        'paidLeaves (Integer, required, default: 24)',
        'sickLeaves (Integer, required, default: 12)',
        'compOffs (Integer, required, default: 0)'
      ]
    },
    {
      id: 'shifts',
      name: 'Shifts',
      description: 'Store shift schedules and on-call assignments',
      attributes: [
        'userId (String, required, 50 chars)',
        'date (String, required, 10 chars)',
        'onCallRole (String, required, 20 chars)',
        'status (String, required, 20 chars)',
        'createdAt (DateTime, required)',
        'updatedAt (DateTime, required)'
      ]
    },
    {
      id: 'leaves',
      name: 'Leave Requests',
      description: 'Store leave applications and approvals',
      attributes: [
        'userId (String, required, 50 chars)',
        'startDate (String, required, 10 chars)',
        'endDate (String, required, 10 chars)',
        'type (String, required, 20 chars)',
        'status (String, required, 20 chars)',
        'reason (String, optional, 500 chars)'
      ]
    },
    {
      id: 'swap_requests',
      name: 'Swap Requests',
      description: 'Store shift swap requests and approvals',
      attributes: [
        'requesterShiftId (String, required, 50 chars)',
        'requesterUserId (String, required, 50 chars)',
        'targetShiftId (String, required, 50 chars)',
        'targetUserId (String, required, 50 chars)',
        'reason (String, required, 500 chars)',
        'status (String, required, 20 chars)',
        'responseNotes (String, optional, 500 chars)',
        'requestedAt (DateTime, required)',
        'respondedAt (DateTime, optional)'
      ]
    },
    {
      id: 'notifications',
      name: 'Notifications',
      description: 'Store user notifications and alerts',
      attributes: [
        'userId (String, required, 50 chars)',
        'type (String, required, 50 chars)',
        'title (String, required, 200 chars)',
        'message (String, required, 1000 chars)',
        'read (Boolean, required, default: false)',
        'relatedId (String, optional, 50 chars)'
      ]
    }
  ];

  const envUpdates = `# Update these in your .env.local file after creating collections:
NEXT_PUBLIC_USERS_COLLECTION_ID=your_actual_users_collection_id
NEXT_PUBLIC_SHIFTS_COLLECTION_ID=your_actual_shifts_collection_id
NEXT_PUBLIC_LEAVE_REQUESTS_COLLECTION_ID=your_actual_leaves_collection_id
NEXT_PUBLIC_SWAP_REQUESTS_COLLECTION_ID=your_actual_swap_requests_collection_id
NEXT_PUBLIC_NOTIFICATIONS_COLLECTION_ID=your_actual_notifications_collection_id`;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900 p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="text-center space-y-4">
          <div className="flex items-center justify-center gap-2">
            <Database className="h-8 w-8 text-blue-600" />
            <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
              RosterPro Database Setup
            </h1>
          </div>
          <p className="text-slate-600 dark:text-slate-400">
            Follow these steps to set up your Appwrite database collections
          </p>
        </div>

        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            The dashboard needs database collections to function properly. Please complete this setup before using the application.
          </AlertDescription>
        </Alert>

        {/* Step 1: Open Appwrite Console */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Badge className="bg-blue-100 text-blue-800">Step 1</Badge>
              Open Appwrite Console
            </CardTitle>
            <CardDescription>
              Navigate to your Appwrite project and access the database section
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-2">
              <Button 
                onClick={() => window.open('https://cloud.appwrite.io', '_blank')}
                className="flex items-center gap-2"
              >
                <ExternalLink className="h-4 w-4" />
                Open Appwrite Console
              </Button>
            </div>
            <p className="text-sm text-slate-600">
              1. Go to your project dashboard<br/>
              2. Click on &ldquo;Databases&rdquo; in the left sidebar<br/>
              3. Select your database: <code className="bg-slate-100 px-2 py-1 rounded">6888b60a003e3d60e987</code>
            </p>
          </CardContent>
        </Card>

        {/* Step 2: Create Collections */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Badge className="bg-green-100 text-green-800">Step 2</Badge>
              Create Collections
            </CardTitle>
            <CardDescription>
              Create the following 5 collections with their exact IDs and attributes
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {collections.map((collection, index) => (
              <div key={collection.id} className="border rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-semibold text-lg">{collection.name}</h3>
                    <p className="text-sm text-slate-600">{collection.description}</p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => copyToClipboard(collection.id, index)}
                    className="flex items-center gap-2"
                  >
                    {copiedSteps[index] ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    Copy ID
                  </Button>
                </div>
                <div className="bg-slate-100 dark:bg-slate-800 p-3 rounded">
                  <p className="text-sm font-mono">Collection ID: {collection.id}</p>
                </div>
                <div>
                  <h4 className="font-medium mb-2">Attributes to add:</h4>
                  <ul className="text-sm space-y-1">
                    {collection.attributes.map((attr, attrIndex) => (
                      <li key={attrIndex} className="font-mono text-xs bg-slate-50 dark:bg-slate-700 p-1 rounded">
                        {attr}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Step 3: Update Environment Variables */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Badge className="bg-orange-100 text-orange-800">Step 3</Badge>
              Update Environment Variables
            </CardTitle>
            <CardDescription>
              Update your .env.local file with the actual collection IDs from Appwrite
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="bg-slate-900 text-green-400 p-4 rounded-lg font-mono text-sm overflow-x-auto">
              <pre>{envUpdates}</pre>
            </div>
            <Button
              variant="outline"
              onClick={() => copyToClipboard(envUpdates, 999)}
              className="flex items-center gap-2"
            >
              {copiedSteps[999] ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              Copy Environment Updates
            </Button>
            <p className="text-sm text-slate-600">
              Replace the placeholder values with the actual collection IDs generated by Appwrite.
            </p>
          </CardContent>
        </Card>

        {/* Step 4: Restart Application */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Badge className="bg-purple-100 text-purple-800">Step 4</Badge>
              Restart Application
            </CardTitle>
            <CardDescription>
              Restart your development server to apply the new environment variables
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="bg-slate-900 text-green-400 p-4 rounded-lg font-mono text-sm">
              <pre>npm run dev</pre>
            </div>
            <p className="text-sm text-slate-600 mt-2">
              After restarting, the dashboard should load with empty data ready to be populated.
            </p>
          </CardContent>
        </Card>

        <div className="text-center">
          <Button onClick={() => window.location.href = '/dashboard'} size="lg">
            Go to Dashboard
          </Button>
        </div>
      </div>
    </div>
  );
}
