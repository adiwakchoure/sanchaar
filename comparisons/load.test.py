import aiohttp
import asyncio
import time
import statistics
import matplotlib.pyplot as plt
import pandas as pd
import seaborn as sns
from collections import defaultdict
from typing import Dict, List, DefaultDict
import json
from datetime import datetime

class LoadTester:
    def __init__(self):
        self.servers = {
            'nginx': 'http://localhost:8081/test-file',
            'apache': 'http://localhost:8082/test-file',
            'caddy': 'http://localhost:8083/test-file',
            'express': 'http://localhost:8084/test-file'
        }
        self.results: Dict[str, DefaultDict] = {
            server: defaultdict(list) for server in self.servers
        }
        
        # Initialize detailed error tracking
        self.error_tracking: Dict[str, DefaultDict[str, int]] = {
            server: defaultdict(int) for server in self.servers
        }

    async def verify_file_size(self, session: aiohttp.ClientSession, url: str) -> bool:
        async with session.head(url) as response:
            if response.status == 200:
                content_length = int(response.headers.get('content-length', 0))
                expected_size = 10 * 1024 * 1024  # 10MB
                return abs(content_length - expected_size) <= 1024  # Allow 1KB difference
            return False

    async def make_request(self, session: aiohttp.ClientSession, url: str, server: str):
        start_time = time.time()
        try:
            async with session.get(url) as response:
                content = await response.read()
                end_time = time.time()
                duration = end_time - start_time
                
                self.results[server]['times'].append(duration)
                self.results[server]['status_codes'].append(response.status)
                self.results[server]['sizes'].append(len(content))
                
                # Track status codes
                status_key = f"status_{response.status}"
                self.error_tracking[server][status_key] += 1
                
                # Verify response size
                expected_size = 10 * 1024 * 1024  # 10MB
                if abs(len(content) - expected_size) > 1024:  # Allow 1KB difference
                    self.error_tracking[server]['size_mismatch'] += 1
                    
        except asyncio.TimeoutError:
            self.error_tracking[server]['timeout'] += 1
            self.results[server]['errors'].append('timeout')
        except aiohttp.ClientError as e:
            self.error_tracking[server]['client_error'] += 1
            self.results[server]['errors'].append(str(e))
        except Exception as e:
            self.error_tracking[server]['other_error'] += 1
            self.results[server]['errors'].append(str(e))

    async def run_tests(self, num_requests: int = 100, concurrent_requests: int = 10):
        print(f"Starting load test with {num_requests} total requests per server")
        print(f"Concurrent requests: {concurrent_requests}")
        
        # Verify file sizes first
        async with aiohttp.ClientSession() as session:
            for server, url in self.servers.items():
                if not await self.verify_file_size(session, url):
                    print(f"WARNING: {server} may not be serving the correct file size!")

        # Run the load test
        async with aiohttp.ClientSession() as session:
            for i in range(0, num_requests, concurrent_requests):
                tasks = []
                for server, url in self.servers.items():
                    for _ in range(min(concurrent_requests, num_requests - i)):
                        tasks.append(self.make_request(session, url, server))
                await asyncio.gather(*tasks)
                print(f"Completed {min(i + concurrent_requests, num_requests)} requests per server")

    def generate_statistics(self):
        stats = {}
        for server, data in self.results.items():
            times = data['times']
            if times:
                stats[server] = {
                    'mean_time': statistics.mean(times),
                    'median_time': statistics.median(times),
                    'std_dev': statistics.stdev(times) if len(times) > 1 else 0,
                    'min_time': min(times),
                    'max_time': max(times),
                    'status_codes': dict(self.error_tracking[server]),
                    'error_count': sum(1 for code in self.error_tracking[server].keys() 
                                     if not code.startswith('status_200')),
                    'success_rate': (self.error_tracking[server]['status_200'] / 
                                   len(times) * 100 if times else 0)
                }
        return stats

    def plot_results(self):
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        stats = self.generate_statistics()
        
        # Create figure with subplots
        fig = plt.figure(figsize=(15, 20))
        gs = plt.GridSpec(4, 2)
        
        # 1. Response Time Distribution (Box Plot)
        ax1 = fig.add_subplot(gs[0, :])
        data_for_box = []
        labels_for_box = []
        for server, data in self.results.items():
            data_for_box.extend(data['times'])
            labels_for_box.extend([server] * len(data['times']))
        
        sns.boxplot(x=labels_for_box, y=data_for_box, ax=ax1)
        ax1.set_title('Response Time Distribution')
        ax1.set_ylabel('Time (seconds)')
        
        # 2. Success Rate Bar Chart
        ax2 = fig.add_subplot(gs[1, 0])
        success_rates = [s['success_rate'] for s in stats.values()]
        ax2.bar(stats.keys(), success_rates)
        ax2.set_title('Success Rate by Server')
        ax2.set_ylabel('Success Rate (%)')
        
        # 3. Error Distribution
        ax3 = fig.add_subplot(gs[1, 1])
        error_data = []
        for server, tracking in self.error_tracking.items():
            for error_type, count in tracking.items():
                if not error_type.startswith('status_200'):
                    error_data.append({'Server': server, 'Error': error_type, 'Count': count})
        if error_data:
            error_df = pd.DataFrame(error_data)
            error_pivot = error_df.pivot(index='Server', columns='Error', values='Count').fillna(0)
            error_pivot.plot(kind='bar', ax=ax3)
            ax3.set_title('Error Distribution by Server')
            ax3.set_ylabel('Count')
            plt.xticks(rotation=45)
        
        # 4. Response Time Timeline
        ax4 = fig.add_subplot(gs[2, :])
        for server, data in self.results.items():
            ax4.plot(data['times'], label=server)
        ax4.set_title('Response Time Timeline')
        ax4.set_xlabel('Request Number')
        ax4.set_ylabel('Time (seconds)')
        ax4.legend()
        
        # Save detailed statistics to file
        with open(f'load_test_stats_{timestamp}.json', 'w') as f:
            json.dump(stats, f, indent=2)
        
        # Save plots
        plt.tight_layout()
        plt.savefig(f'load_test_results_{timestamp}.png')
        
        # Print statistics
        print("\nDetailed Statistics:")
        for server, stat in stats.items():
            print(f"\n{server.upper()}:")
            print(f"Mean response time: {stat['mean_time']:.3f} seconds")
            print(f"Median response time: {stat['median_time']:.3f} seconds")
            print(f"Min time: {stat['min_time']:.3f} seconds")
            print(f"Max time: {stat['max_time']:.3f} seconds")
            print(f"Standard deviation: {stat['std_dev']:.3f} seconds")
            print(f"Success rate: {stat['success_rate']:.1f}%")
            print("Status Codes:", stat['status_codes'])
            print(f"Total Errors: {stat['error_count']}")

async def main():
    tester = LoadTester()
    await tester.run_tests(num_requests=100, concurrent_requests=10)
    tester.plot_results()
