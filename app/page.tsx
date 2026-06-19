import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-6 bg-kaokao-beige">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <CardTitle>
            <h1 className="font-display text-4xl font-bold text-kaokao-brown">
              KAOKAO
            </h1>
          </CardTitle>
          <CardDescription className="text-base mt-2">
            Find lost pets near you
          </CardDescription>
        </CardHeader>
        <CardContent className="flex justify-center">
          <Button className="w-full">Get Started</Button>
        </CardContent>
      </Card>
    </main>
  );
}
