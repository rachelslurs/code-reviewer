# Code Reviewer - About Page

A beautiful, responsive one-page website showcasing the Code Reviewer project. Built with React and Tailwind CSS, designed for GitHub Pages hosting.

## 🚀 Features

- **Responsive Design**: Looks great on all devices
- **Modern UI**: Clean, professional design with smooth animations
- **Interactive Demos**: Live examples of the CLI tool in action
- **Comprehensive Documentation**: All features and installation steps
- **GitHub Pages Ready**: Optimized for static hosting

## 🛠 Development

### Prerequisites

- Node.js 18+ 
- npm or yarn

### Setup

```bash
cd about-page
npm install
npm start
```

### Build for Production

```bash
npm run build
```

## 📁 Project Structure

```
about-page/
├── public/
│   ├── index.html
│   └── manifest.json
├── src/
│   ├── components/
│   │   ├── Hero.js
│   │   ├── Features.js
│   │   ├── Templates.js
│   │   ├── Demo.js
│   │   ├── Installation.js
│   │   └── Footer.js
│   ├── App.js
│   ├── index.js
│   └── index.css
├── package.json
├── tailwind.config.js
└── postcss.config.js
```

## 🎨 Customization

### Colors

The color scheme can be customized in `tailwind.config.js`:

```javascript
colors: {
  primary: {
    // Your primary color palette
  },
  accent: {
    // Your accent color palette
  }
}
```

### Content

Update the content in each component file:
- `Hero.js` - Main headline and CTA
- `Features.js` - Feature descriptions
- `Templates.js` - Review template information
- `Demo.js` - Command examples and output
- `Installation.js` - Setup instructions
- `Footer.js` - Links and contact info

## 🚀 Deployment

### GitHub Pages

1. Push your changes to the main branch
2. The GitHub Action will automatically build and deploy
3. Your site will be available at `https://yourusername.github.io/code-reviewer`

### Manual Deployment

```bash
npm run build
# Upload the build/ folder to your hosting provider
```

## 📱 Responsive Breakpoints

- **Mobile**: < 640px
- **Tablet**: 640px - 1024px  
- **Desktop**: > 1024px

## 🎯 Performance

- Optimized images and assets
- Minimal JavaScript bundle
- CSS purging for smaller file sizes
- Lazy loading for better performance

## 📄 License

MIT License - see the main project LICENSE file for details.

