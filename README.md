# RosterPro - Advanced Roster Planning Application

RosterPro is a full-stack roster planning application built with Next.js, TypeScript, Tailwind CSS, ShadCN UI, and Appwrite. The app manages on-call schedules, leave requests, and shift swapping for teams.

## 🚀 Features

- **Role-based Authentication** (Manager/Employee/Admin)
- **Real-time Dashboard** with live updates
- **On-call Shift Scheduling** with drag-and-drop interface
- **Leave Management** (Paid, Sick, Comp-off) with approval workflow
- **Shift Swapping** with approval system
- **Real-time Notifications** for all activities
- **Export Functionality** (Excel/CSV/JSON)
- **Manager Comments** for leave approvals/rejections
- **Leave Balance Tracking** with automatic deduction

## 🛠 Tech Stack

- **Frontend**: Next.js 14+ with App Router, TypeScript, Tailwind CSS
- **UI Components**: ShadCN UI with Lucide Icons
- **Backend/Database**: Appwrite (Database, Authentication, Real-time subscriptions)
- **Styling**: Tailwind CSS with professional, modern design patterns

## 📋 Prerequisites

- Node.js 18+ 
- npm or yarn
- Appwrite account and project setup

## 🔧 Environment Variables

Copy `.env.example` to `.env.local` and fill in your values:

```bash
# Appwrite Configuration
NEXT_PUBLIC_APPWRITE_ENDPOINT=https://cloud.appwrite.io/v1
NEXT_PUBLIC_APPWRITE_PROJECT_ID=your-project-id
APPWRITE_API_KEY=your-api-key
APPWRITE_DEV_KEY=your-dev-key

# Database Configuration  
NEXT_PUBLIC_DATABASE_ID=your-database-id
NEXT_PUBLIC_USERS_COLLECTION_ID=users
NEXT_PUBLIC_SHIFTS_COLLECTION_ID=shifts
NEXT_PUBLIC_LEAVE_REQUESTS_COLLECTION_ID=leave_requests
NEXT_PUBLIC_SWAP_REQUESTS_COLLECTION_ID=swap_requests
NEXT_PUBLIC_NOTIFICATIONS_COLLECTION_ID=notifications

# Optional
DEFAULT_USER_PASSWORD=ChangeMe123!
```

## 🚀 Getting Started

1. **Clone the repository**
```bash
git clone https://github.com/bhaimicrosoft/rosterpro.git
cd rosterpro
```

2. **Install dependencies**
```bash
npm install
```

3. **Set up environment variables**
```bash
cp .env.example .env.local
# Edit .env.local with your Appwrite credentials
```

4. **Run the development server**
```bash
npm run dev
```

5. **Open your browser**
Navigate to [http://localhost:3000](http://localhost:3000)

## 🔐 Appwrite Setup

1. Create an Appwrite project at [cloud.appwrite.io](https://cloud.appwrite.io)
2. Create a database with the following collections:
   - `users` - User profiles and leave balances
   - `shifts` - Scheduled shifts and assignments  
   - `leave_requests` - Leave applications
   - `swap_requests` - Shift swap requests
   - `notifications` - User notifications

3. Set up authentication with email/password
4. Get your project credentials and update `.env.local`

## 🌐 Deployment to Vercel

### Prerequisites
- Vercel account
- GitHub repository connected to Vercel

### Step 1: Environment Variables in Vercel
Add these environment variables in your Vercel project settings:

```
NEXT_PUBLIC_APPWRITE_ENDPOINT
NEXT_PUBLIC_APPWRITE_PROJECT_ID  
APPWRITE_API_KEY
APPWRITE_DEV_KEY
NEXT_PUBLIC_DATABASE_ID
NEXT_PUBLIC_USERS_COLLECTION_ID
NEXT_PUBLIC_SHIFTS_COLLECTION_ID
NEXT_PUBLIC_LEAVE_REQUESTS_COLLECTION_ID
NEXT_PUBLIC_SWAP_REQUESTS_COLLECTION_ID
NEXT_PUBLIC_NOTIFICATIONS_COLLECTION_ID
DEFAULT_USER_PASSWORD
```

### Step 2: Deploy
```bash
# Build and deploy
npm run build
vercel --prod
```

### Step 3: GitHub Actions (Optional)
The repository includes GitHub Actions workflow for automatic deployment on push to main/master branch.

## 📁 Project Structure

```
├── src/
│   ├── app/                 # Next.js App Router pages
│   │   ├── (auth)/         # Authentication pages
│   │   ├── (dashboard)/    # Dashboard pages  
│   │   └── setup/          # Setup page
│   ├── components/         # React components
│   │   ├── ui/            # ShadCN UI components
│   │   ├── dashboard/     # Dashboard-specific components
│   │   └── layout/        # Layout components
│   ├── contexts/          # React contexts
│   ├── hooks/             # Custom hooks
│   ├── lib/               # Utility libraries
│   │   └── appwrite/      # Appwrite configuration
│   └── types/             # TypeScript type definitions
├── .env.example           # Environment variables template
├── vercel.json           # Vercel configuration
└── .github/workflows/    # GitHub Actions
```

## 🎯 Key Features Explained

### Leave Management
- **Balance Tracking**: Automatic deduction/restoration of leave balances
- **Manager Comments**: Inline comments during approval/rejection
- **Real-time Updates**: Live balance updates via Appwrite subscriptions
- **Validation**: Prevents overlapping leaves and insufficient balance

### Shift Swapping  
- **Approval Workflow**: Manager or peer approval system
- **Real-time Notifications**: Instant updates on swap status
- **History Tracking**: Complete audit trail of swap requests
- **Conflict Prevention**: Automatic validation of swap feasibility

### Dashboard
- **Live Data**: Real-time updates using Appwrite subscriptions
- **Role-based Views**: Different interfaces for managers and employees
- **Quick Actions**: One-click approvals and common operations
- **Visual Calendar**: Drag-and-drop shift management

## 🔧 Development

```bash
# Development with hot reload
npm run dev

# Build for production
npm run build

# Start production server  
npm start

# Lint code
npm run lint
```

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📝 License

This project is private and proprietary.

## 📧 Support

For support, please contact the development team or create an issue in the repository.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
