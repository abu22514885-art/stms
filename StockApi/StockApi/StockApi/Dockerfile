FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src
COPY *.csproj ./
RUN dotnet restore
COPY . ./
# the build must not fail if the Fonts folder was not pushed yet
RUN mkdir -p /src/Fonts
RUN dotnet publish -c Release -o /app --no-restore

FROM mcr.microsoft.com/dotnet/aspnet:10.0
# QuestPDF (receipts and reports) needs these on Linux
RUN apt-get update && apt-get install -y --no-install-recommends libfontconfig1 fonts-dejavu-core \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=build /app .
# Amharic font for the receipt PDF
COPY --from=build /src/Fonts ./Fonts
ENV ASPNETCORE_HTTP_PORTS=10000
EXPOSE 10000
ENTRYPOINT ["dotnet", "StockApi.dll"]