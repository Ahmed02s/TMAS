Learning Management System (TMAS) – Final System Requirements Specification
1. System Overview

The Tracking, Monitoring, and Assessing Students (TMAS) Learning Management System is a web-based platform designed for higher educational institutions. The system enables administrators to manage academic structures, lecturers to upload learning materials and generate AI-powered quizzes, and students to access course content and complete assessments while their progress is continuously monitored.

The system follows the academic hierarchy:

Institution → Academic Level → Courses → Learning Materials → AI-Generated Assessments

2. Landing Page Requirements

The LMS shall provide a responsive public landing page that serves as the entry point for all users.

2.1 Public Features

Institution branding and logo

System overview and benefits

Feature highlights

How the platform works

About the institution section

Frequently Asked Questions (FAQ)

Contact information and inquiry form

Privacy Policy and Terms of Service links

2.2 Navigation

The landing page shall include:

Home

Features

About

Contact

FAQ

Login

Register

2.3 Call-to-Action

Users shall be able to:

Register as a Student

Register as a Lecturer

Login to an existing account

3. User Roles

The system shall support three primary roles:

Role

	

Access Scope




Administrator

	

Full institutional control




Lecturer

	

Assigned levels and courses only




Student

	

Enrolled courses only

Role-Based Access Control (RBAC) shall be strictly enforced throughout the system.

4. Lecturer Registration and Approval Workflow
4.1 Registration Process

Lecturer completes the registration form.

System creates the account with Pending Approval status.

Lecturer cannot access the platform until approved.

Administrator receives an immediate approval notification.

Administrator reviews submitted information.

Administrator may Approve, Reject, or Suspend the account.

Approved lecturers receive an activation notification and gain dashboard access.

4.2 Account Statuses

Pending Approval

Approved

Rejected

Suspended

5. Notification System

The LMS shall provide a centralized real-time notification system.

5.1 Supported Channels

In-app notifications

Email notifications

Browser push notifications

Mobile push notifications (future/PWA support)

5.2 Administrator Notifications

Administrators shall receive notifications for:

New lecturer registrations

Pending approval requests

Course creation or updates

AI processing failures

Storage capacity warnings

Security events

Pending administrative actions

5.3 Lecturer Notifications

Lecturers shall receive notifications for:

Account approval

Course assignments

Level assignments

Student enrollments

Material processing completion

AI quiz generation completion

Quiz completion activities

Assignment deadlines

Administrative announcements

5.4 Student Notifications

Students shall receive notifications for:

Course enrollment

New learning materials

Available quizzes

Upcoming deadlines

Quiz results

Course progress milestones

Lecturer announcements

6. Academic Structure Management

The Administrator shall manage the academic hierarchy:

Institution → Levels → Courses → Materials → Assessments

Example levels:

Level 100

Level 200

Level 300

Level 400

The structure shall be configurable for different institutions.

7. Academic Level Management

Administrators shall be able to:

Create levels

Edit levels

Delete levels

Archive levels

Activate levels

Define level ordering

Assign courses to levels

The system shall support predefined levels while allowing custom academic structures.

8. Course Management

Each course shall contain:

Field

	

Description




Course Code

	

Unique identifier




Course Title

	

Official course name




Description

	

Course overview




Academic Level

	

Assigned level




Semester

	

Teaching semester




Credit Hours

	

Optional field




Assigned Lecturer(s)

	

One or multiple lecturers




Status

	

Active / Archived

Administrators shall be able to create, edit, archive, delete, and duplicate courses.

9. Lecturer Teaching Assignment Management

A lecturer may teach multiple courses across different levels.

The My Teaching Assignments section shall display:

Assigned levels

Assigned courses

Number of enrolled students

Course progress

Student completion rates

Quiz analytics

Lecturers shall only access courses explicitly assigned to them.

10. Student Enrollment and Course Access Control

Students shall only access courses in which they are officially enrolled.

The system shall enforce:

Student → Academic Level → Assigned Courses

Access restrictions shall apply to:

Learning materials

Slides and documents

AI-generated quizzes

Assessments

Progress tracking

Announcements

Course analytics

11. AI-Based Quiz Generation from Uploaded Materials
11.1 Material Upload

Lecturers shall upload:

PDF

DOC/DOCX

PPT/PPTX

TXT

Markdown files

Materials shall be securely stored under the corresponding course.

11.2 AI Processing

After upload, the system shall automatically:

Extract text from the document

Clean and preprocess content

Identify topics and subtopics

Detect learning objectives

Store processed content for quiz generation

11.3 Quiz Generation Requirement

All quizzes shall be generated exclusively from the uploaded learning materials.

The AI shall not create questions unrelated to the uploaded content.

Supported question types:

Multiple Choice Questions (MCQs)

True/False

Fill in the Blank

Short Answer (optional)

Scenario-Based Questions (optional)

Each question shall include:

Question text

Answer options

Correct answer

Difficulty level

Topic reference

Marks allocation

Optional explanation

11.4 Lecturer Review

Before publication, lecturers shall be able to:

Review generated questions

Edit questions

Delete questions

Regenerate selected questions

Generate additional questions from specific topics

Approve quizzes for publication

Only approved quizzes shall be visible to students.

11.5 Quiz Configuration

Lecturers shall configure:

Number of questions

Question types

Difficulty level

Topics to include

Randomization

Time limit

Passing score

Attempt limits

Availability schedule

11.6 Quiz Integrity

The system shall ensure that:

Questions are derived only from uploaded materials

Duplicate questions are minimized

Questions remain relevant to course content

Incomplete extractions are flagged for review

Academic integrity is maintained

12. Assessment Workflow

Lecturer uploads learning material.

AI processes the material.

AI generates a question bank.

Lecturer reviews and approves questions.

Quiz is published.

Students attempt the quiz.

System automatically marks objective questions.

Results are stored and analytics updated.

13. Student Learning Experience

Students shall be able to:

View enrolled courses

Access learning materials

Track reading progress

Attempt available quizzes

View scores and feedback

Monitor course completion percentage

Receive learning reminders and notifications

The system shall support randomized question order where enabled.

14. Analytics and Monitoring
14.1 Lecturer Analytics

Lecturers shall view:

Average quiz scores

Question difficulty analysis

Frequently missed questions

Topic mastery levels

Student performance trends

Completion rates

Pass/fail statistics

14.2 Administrator Analytics

Administrators shall view institution-wide analytics including:

Total students

Total lecturers

Course enrollment statistics

Level-wise performance

At-risk student identification

System usage metrics

AI processing statistics

15. Smart Administrative Features

The administrator interface shall minimize manual typing through:

Searchable dropdowns

Multi-select controls

Checkboxes

Auto-complete fields

Smart suggestions

Bulk operations

15.1 Bulk Operations

Supported bulk actions:

Approve multiple lecturers

Reject multiple lecturers

Assign lecturers to courses

Assign courses to levels

Enroll multiple students

Archive multiple courses

Send announcements to selected groups

All bulk operations shall require confirmation before execution.

15.2 Intelligent Search and Filtering

Administrators shall search and filter by:

Lecturer name

Student name

Course title

Course code

Academic level

Email address

Registration status

Approval status

Course status

16. Security Requirements

The system shall implement:

Secure authentication

Password hashing

Role-based authorization

Session management

Input validation and sanitization

File upload validation

Protection against unauthorized course access

Audit logging for administrative actions

17. Non-Functional Requirements

Requirement

	

Specification




Availability

	

24/7 access for authorized users




Performance

	

Dashboard loads within 3 seconds under normal conditions




Scalability

	

Support increasing numbers of users and courses




Usability

	

Responsive interface for desktop, tablet, and mobile




Maintainability

	

Modular architecture using React and FastAPI




Reliability

	

Automatic error handling and recovery mechanisms




Compatibility

	

Support modern web browsers

18. Complete System Workflow

Administrator creates academic levels.

Administrator creates courses.

Administrator assigns courses to levels.

Lecturer registers an account.

System creates a pending lecturer account.

Administrator receives an approval notification.

Administrator approves the lecturer account.

Administrator assigns the lecturer to courses and levels.

Students register and are enrolled into appropriate levels and courses.

Lecturer uploads learning materials.

AI processes the uploaded materials.

AI generates quizzes from the uploaded content.

Lecturer reviews and publishes quizzes.

Students access only their enrolled courses.

Students complete learning materials and quizzes.

System tracks progress and updates analytics.

Lecturers monitor course performance.

Administrators oversee the entire institution through analytics, notifications, and user management.

Final Project Scope

The completed TMAS system shall deliver:

Public Landing Page

Secure Multi-Role Authentication

Administrator Approval Workflow

Academic Level and Course Management

Smart Lecturer Assignment

Student Enrollment Management

AI-Powered Quiz Generation from Uploaded Materials

Automated Assessment and Progress Tracking

Real-Time Notification System

Comprehensive Analytics Dashboard

Role-Based Access Control

Responsive Web Interface

Scalable React + FastAPI Architecture

This final specification is suitable for inclusion in the Software Requirements Specification (SRS) chapter of your TMAS final-year project report and can also serve as the development blueprint for the React frontend and FastAPI backend implementation.