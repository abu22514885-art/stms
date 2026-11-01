import { AfterViewInit, Component, ElementRef, Input, OnChanges, OnDestroy, ViewChild } from '@angular/core';
import Chart from 'chart.js/auto';

export interface ChartSet { label: string; data: number[]; }

const PALETTE = ['#2c806c', '#6e88d9', '#e37a60', '#9cb843', '#8970b8', '#d1a342', '#d66a82', '#526a64'];

// Small wrapper around Chart.js. Pass labels and one or more data sets.
@Component({
  selector: 'app-chart',
  standalone: true,
  template: `<canvas #canvas></canvas>`,
  styles: [`:host { display: block; position: relative; height: 260px; }`]
})
export class ChartComponent implements AfterViewInit, OnChanges, OnDestroy {
  @Input() type: 'line' | 'bar' | 'doughnut' = 'line';
  @Input() labels: string[] = [];
  @Input() sets: ChartSet[] = [];

  @ViewChild('canvas') canvas!: ElementRef<HTMLCanvasElement>;
  private chart: Chart | null = null;

  ngAfterViewInit(): void { this.draw(); }
  ngOnChanges(): void { if (this.canvas) this.draw(); }
  ngOnDestroy(): void { this.chart?.destroy(); }

  private draw(): void {
    this.chart?.destroy();
    const doughnut = this.type === 'doughnut';
    const dark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const text = dark ? '#cbd5e1' : '#475569';
    const grid = dark ? 'rgba(148,163,184,0.18)' : 'rgba(100,116,139,0.18)';

    const config: any = {
      type: this.type,
      data: {
        labels: this.labels,
        datasets: this.sets.map((s, i) => ({
          label: s.label,
          data: s.data,
          borderColor: doughnut ? undefined : PALETTE[i % PALETTE.length],
          backgroundColor: doughnut
            ? s.data.map((_, k) => PALETTE[k % PALETTE.length])
            : this.type === 'bar' ? PALETTE[i % PALETTE.length] : PALETTE[i % PALETTE.length] + '22',
          fill: this.type === 'line',
          tension: 0.3,
          borderWidth: doughnut ? 0 : 2,
          pointRadius: 2
        }))
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: doughnut || this.sets.length > 1, labels: { color: text } } },
        scales: doughnut ? {} : {
          x: { ticks: { color: text, maxRotation: 0, autoSkip: true }, grid: { display: false } },
          y: { beginAtZero: true, ticks: { color: text }, grid: { color: grid } }
        }
      }
    };
    this.chart = new Chart(this.canvas.nativeElement, config);
  }
}
