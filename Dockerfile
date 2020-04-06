FROM node:alpine

# Create app directory
WORKDIR /usr/src/app

# Install pm2
RUN npm install pm2 -g

# Bundle app source
COPY . .

# Install app dependencies
#COPY package.json .
# For npm@5 or later, copy package-lock.json as well
# COPY package.json package-lock.json .

RUN npm install

# Bundle app source
COPY . .

EXPOSE 8080 7000

CMD ["pm2-runtime", "ecosystem.config.js", "--env", "env_development"]