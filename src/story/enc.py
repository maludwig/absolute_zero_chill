import argparse
import json
import sys

def main():
    # Set up command-line arguments
    parser = argparse.ArgumentParser(description="JSON encode a text file.")
    parser.add_argument("--text-path", required=True, help="Path to the input text file")
    parser.add_argument("--json-path", required=True, help="Path to the output JSON file")
    args = parser.parse_args()

    try:
        # Read the raw text file
        with open(args.text_path, 'r', encoding='utf-8') as f:
            text_content = f.read()
            
        # Wrap the text in a dictionary so it outputs as a proper JSON object
        json_data = {"content": text_content}
        
        # Write out the JSON, properly escaped
        with open(args.json_path, 'w', encoding='utf-8') as f:
            json.dump(json_data, f, indent=2)
            
        print(f"Success! Encoded {args.text_path} into {args.json_path}")
        
    except FileNotFoundError:
        print(f"Error: Could not find the file '{args.text_path}'", file=sys.stderr)
    except Exception as e:
        print(f"An error occurred: {e}", file=sys.stderr)

if __name__ == "__main__":
    main()