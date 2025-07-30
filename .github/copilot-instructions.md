# Copilot Instructions for RosterPro

<!-- Use this file to provide workspace-specific custom instructions to Copilot. For more details, visit https://code.visualstudio.com/docs/copilot/copilot-customization#_use-a-githubcopilotinstructionsmd-file -->

## Project Overview
RosterPro is a full-stack roster planning application built with Next.js, TypeScript, Tailwind CSS, ShadCN UI, and Appwrite. The app manages on-call schedules, leave requests, and shift swapping for teams.

## Tech Stack
- **Frontend**: Next.js 14+ with App Router, TypeScript, Tailwind CSS
- **UI Components**: ShadCN UI with Lucide Icons
- **Backend/Database**: Appwrite (Database, Authentication, Real-time subscriptions, Storage)
- **Styling**: Tailwind CSS with professional, modern design patterns

## Key Features
- Role-based authentication (Manager/Employee/Admin)
- Real-time dashboard updates
- On-call shift scheduling
- Leave management (Paid, Sick, Comp-off)
- Shift swapping with approval workflow
- Real-time notifications
- Export functionality (Excel/CSV/JSON)

## Architecture Patterns
- Use Appwrite collections for data persistence
- Implement real-time subscriptions for live updates
- Follow Next.js App Router conventions
- Use TypeScript for type safety
- Implement proper error handling and loading states

## Code Standards
- Use descriptive TypeScript interfaces/types
- Follow ShadCN UI component patterns
- Implement proper form validation
- Use Appwrite SDK best practices
- Maintain consistent file organization

## Database Schema (Appwrite Collections)
- **users**: User profiles with roles and leave balances
- **shifts**: Scheduled shifts with assignments
- **leave_requests**: Leave applications with approval status
- **swap_requests**: Shift swap requests with approval workflow
- **notifications**: User notifications for real-time updates

## Security & Authentication
- Use Appwrite Authentication for secure login
- Implement role-based access control
- Validate user permissions on both client and server
- Secure API routes with proper authentication checks
