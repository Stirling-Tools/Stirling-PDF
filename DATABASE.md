# New Database Backup and Import Functionality

**Full activation will take place on approximately January 5th, 2025!**

Why is the waiting time six months?

There are users who only install updates sporadically; if they skip the preparation, it can/will lead to data loss in the database.

## Functionality Overview

The newly introduced feature enhances the application with robust database backup and import capabilities. This feature is designed to ensure data integrity and provide a straightforward way to manage database backups. Here's how it works:

1. Automatic Backup Creation
   - The system automatically creates a database backup every day at midnight. This ensures that there is always a recent backup available, minimizing the risk of data loss.
2. Manual Backup Export
   - Admin actions that modify the user database trigger a manual export of the database. This keeps the backup up-to-date with the latest changes and provides an extra layer of data security.
3. Importing Database Backups
   - Admin users can import a database backup either via the web interface or API endpoints. This allows for easy restoration of the database to a previous state in case of data corruption or other issues.
   - The import process ensures that the database structure and data are correctly restored, maintaining the integrity of the application.
4. Managing Backup Files
   - Admins can view a list of all existing backup files, along with their creation dates and sizes. This helps in managing storage and identifying the most recent or relevant backups.
   - Backup files can be downloaded for offline storage or transferred to other environments, providing flexibility in database management.
   - Unnecessary backup files can be deleted through the interface to free up storage space and maintain an organized backup directory.

## User Interface

### Web Interface

1. Upload SQL files to import database backups.
2. View details of existing backups, such as file names, creation dates, and sizes.
3. Download backup files for offline storage.
4. Delete outdated or unnecessary backup files.

### API Endpoints

1. Import database backups by uploading SQL files.
2. Download backup files.
3. Delete backup files.

This new functionality streamlines database management, ensuring that backups are always available and easy to manage, thus improving the reliability and resilience of the application.
