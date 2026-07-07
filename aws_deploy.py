#!/usr/bin/env python3
import argparse
import boto3
import shutil
import requests
import os
import sys
import time

def deploy_to_amplify(args):
    zip_name = "deploy"
    zip_file_path = f"{zip_name}.zip"

    # 1. Zip the build folder
    print(f"📦 Zipping the '{args.build_dir}' folder...")
    try:
        shutil.make_archive(zip_name, 'zip', args.build_dir)
    except FileNotFoundError:
        print(f"❌ Error: Could not find build directory '{args.build_dir}'. Did you run your build command?", file=sys.stderr)
        return

    # Initialize the Boto3 Session with the optional profile
    if args.profile:
        print(f"🔑 Using AWS profile: {args.profile}")
        session = boto3.Session(profile_name=args.profile)
    else:
        print("🔑 Using default AWS profile")
        session = boto3.Session()

    amplify = session.client('amplify')

    try:
        # 2. Request a deployment URL
        print("☁️ Requesting deployment URL from AWS Amplify...")
        create_response = amplify.create_deployment(
            appId=args.app_id,
            branchName=args.branch
        )
        
        upload_url = create_response['zipUploadUrl']
        job_id = create_response['jobId']

        # 3. Upload the zip file
        print("⬆️ Uploading deploy.zip...")
        with open(zip_file_path, 'rb') as zip_file:
            upload_response = requests.put(
                upload_url, 
                data=zip_file, 
                headers={'Content-Type': 'application/zip'}
            )
            upload_response.raise_for_status()

        # 4. Start the deployment
        print("⚙️ Starting the deployment process...")
        amplify.start_deployment(
            appId=args.app_id,
            branchName=args.branch,
            jobId=job_id
        )

        # 5. Poll for deployment status
        print("⏳ Waiting for deployment to finish", end="")
        while True:
            job_response = amplify.get_job(
                appId=args.app_id,
                branchName=args.branch,
                jobId=job_id
            )
            
            status = job_response['job']['summary']['status']

            if status == 'SUCCEED':
                print(f"\n✅ Deployment succeeded for branch '{args.branch}'!")
                break
            elif status in ['FAILED', 'CANCELLED']:
                print(f"\n❌ Deployment {status.lower()}. Check the AWS console for details.", file=sys.stderr)
                sys.exit(1)
            else:
                # Status is usually PENDING, PROVISIONING, or RUNNING
                print(".", end="", flush=True)
                time.sleep(5)  # Wait 5 seconds before checking again

    except Exception as e:
        print(f"\n❌ Deployment failed: {e}", file=sys.stderr)

    finally:
        # 6. Clean up
        if os.path.exists(zip_file_path):
            print("🧹 Cleaning up temporary files...")
            os.remove(zip_file_path)

def main():
    parser = argparse.ArgumentParser(description="Programmatically deploy a static React build to AWS Amplify.")
    parser.add_argument("--app-id", required=True, help="The AWS Amplify App ID (e.g., d1234567890abc)")
    parser.add_argument("--branch", default="main", help="The Amplify branch to deploy to (defaults to 'main')")
    parser.add_argument("--build-dir", default="build", help="The local directory containing the compiled app (defaults to 'build')")
    parser.add_argument("--profile", help="The AWS profile to use from ~/.aws/credentials (optional)")

    args = parser.parse_args()
    deploy_to_amplify(args)

if __name__ == "__main__":
    main()
