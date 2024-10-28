import os
import json
import csv
import matplotlib.pyplot as plt
import pandas as pd

def process_json_file(file_path):
    with open(file_path, 'r') as f:
        data = json.load(f)
    
    tool_name = os.path.splitext(os.path.basename(file_path))[0]
    
    durations = data['durations']
    total_duration = durations['total']['duration']
    setup_duration = durations['toolSetup']['duration']
    measurement_duration = durations['measurements']['total']['duration']
    
    measurements = data['measurements']
    speeds = []
    for m in measurements:
        for size in ['1MB', '2MB', '3MB']:
            buffer_key = f'{size}_buffer'
            if buffer_key in m['fileTransfers']:
                speeds.append(m['fileTransfers'][buffer_key]['speedDownload'])
    
    avg_speed = sum(speeds) / len(speeds) if speeds else 0
    
    return {
        'Tool': tool_name,
        'Total Duration': total_duration,
        'Setup Duration': setup_duration,
        'Measurement Duration': measurement_duration,
        'Avg Download Speed': avg_speed
    }

def process_directory(directory):
    results = []
    for filename in os.listdir(directory):
        if filename.endswith('.json'):
            file_path = os.path.join(directory, filename)
            results.append(process_json_file(file_path))
    return results

def create_csv(results, output_file):
    fieldnames = ['Tool', 'Total Duration', 'Setup Duration', 'Measurement Duration', 'Avg Download Speed']
    with open(output_file, 'w', newline='') as csvfile:
        writer = csv.DictWriter(csvfile, fieldnames=fieldnames)
        writer.writeheader()
        for row in results:
            writer.writerow(row)

def create_duration_graphs(results, output_dir):
    df = pd.DataFrame(results)
    
    fig, (ax1, ax2, ax3) = plt.subplots(3, 1, figsize=(15, 20))
    
    df.sort_values('Total Duration', ascending=False).plot(x='Tool', y='Total Duration', kind='bar', ax=ax1)
    ax1.set_title('Total Duration by Tool')
    ax1.set_ylabel('Duration (ms)')
    
    df.sort_values('Setup Duration', ascending=False).plot(x='Tool', y='Setup Duration', kind='bar', ax=ax2)
    ax2.set_title('Setup Duration by Tool')
    ax2.set_ylabel('Duration (ms)')
    
    df.sort_values('Measurement Duration', ascending=False).plot(x='Tool', y='Measurement Duration', kind='bar', ax=ax3)
    ax3.set_title('Measurement Duration by Tool')
    ax3.set_ylabel('Duration (ms)')
    
    plt.tight_layout()
    plt.savefig(os.path.join(output_dir, 'duration_graphs.png'))
    plt.close()

def create_speed_graph(results, output_dir):
    df = pd.DataFrame(results)
    
    plt.figure(figsize=(15, 10))
    df.sort_values('Avg Download Speed', ascending=False).plot(x='Tool', y='Avg Download Speed', kind='bar')
    plt.title('Average Download Speed by Tool')
    plt.ylabel('Speed (bytes/second)')
    plt.tight_layout()
    plt.savefig(os.path.join(output_dir, 'speed_graph.png'))
    plt.close()

def main():
    directory = input("Enter the directory path containing JSON files: ")
    parsed_directory = os.path.join(directory, 'parsed')
    os.makedirs(parsed_directory, exist_ok=True)
    
    results = process_directory(directory)
    
    csv_output = os.path.join(parsed_directory, 'network_measurements.csv')
    create_csv(results, csv_output)
    print(f"CSV file created: {csv_output}")
    
    create_duration_graphs(results, parsed_directory)
    print("Duration graphs created: duration_graphs.png")
    
    create_speed_graph(results, parsed_directory)
    print("Speed graph created: speed_graph.png")

if __name__ == "__main__":
    main()